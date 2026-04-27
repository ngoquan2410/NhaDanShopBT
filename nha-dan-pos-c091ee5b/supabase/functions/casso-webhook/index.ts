// Casso webhook receiver.
// - Public endpoint (no JWT).
// - Supports both legacy Webhook (Secure-Token) and Webhook V2 (X-Casso-Signature).
// - Idempotent via UNIQUE (provider, provider_tx_id) on payment_events.
// - Extracts order code (e.g. DH-20240115-1234) from the transfer description
//   when possible; otherwise stores as 'unmatched' for admin to link manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, secure-token, x-casso-signature",
};

const ORDER_CODE_RE = /DH[-\s]?(\d{8})[-\s]?(\d{4})/i;
const encoder = new TextEncoder();

function extractOrderCode(description: string): string | null {
  if (!description) return null;
  const normalized = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ");
  const m = normalized.match(ORDER_CODE_RE);
  if (!m) return null;
  return `DH-${m[1]}-${m[2]}`.toUpperCase();
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function parseSignatureHeader(signatureHeader: string | null): {
  timestamp: string;
  signature: string;
} | null {
  if (!signatureHeader) return null;

  const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/i);
  if (!match) return null;

  return {
    timestamp: match[1],
    signature: match[2],
  };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function signWithSha512(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

async function verifyV2Signature(body: unknown, signatureHeader: string | null, secret: string): Promise<boolean> {
  const parsedSignature = parseSignatureHeader(signatureHeader);
  if (!parsedSignature) return false;

  const sortedBody = sortObjectKeys(body);
  const payloadToSign = `${parsedSignature.timestamp}.${JSON.stringify(sortedBody)}`;
  const expectedSignatureBytes = await signWithSha512(payloadToSign, secret);
  const providedSignatureBytes = hexToBytes(parsedSignature.signature);

  if (!providedSignatureBytes) return false;
  return constantTimeEqual(expectedSignatureBytes, providedSignatureBytes);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedToken = Deno.env.get("CASSO_WEBHOOK_TOKEN");
  if (!expectedToken) {
    console.error("CASSO_WEBHOOK_TOKEN is not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const v2Signature = req.headers.get("x-casso-signature");
  if (v2Signature) {
    const isValidSignature = await verifyV2Signature(body, v2Signature, expectedToken);
    if (!isValidSignature) {
      console.warn("Invalid X-Casso-Signature");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    const providedToken =
      req.headers.get("secure-token") ?? req.headers.get("Secure-Token");

    if (providedToken !== expectedToken) {
      console.warn("Invalid secure-token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const transactions: any[] = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body)
    ? body
    : body?.data
    ? [body.data]
    : [];

  if (transactions.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tx of transactions) {
    const providerTxId = String(
      tx.tid ?? tx.id ?? tx.transactionId ?? tx.reference ?? "",
    ).trim();
    if (!providerTxId) {
      errors.push("Missing tx id");
      continue;
    }

    const description: string = String(tx.description ?? tx.content ?? "");
    const amountRaw = Number(tx.amount ?? tx.value ?? 0);
    const amount = Math.max(0, Math.round(amountRaw));
    const matchedCode = extractOrderCode(description);
    const txTime = tx.when ?? tx.transactionDateTime ?? tx.tranDate ?? null;
    const parsedTxTime = txTime ? new Date(txTime) : null;

    const row = {
      provider: "casso",
      provider_tx_id: providerTxId,
      amount,
      transfer_content: description,
      matched_code: matchedCode,
      bank_account: tx.bankAccount ?? tx.accountNumber ?? tx.bank_account ?? null,
      bank_sub_acc:
        tx.subAccId ?? tx.bank_sub_acc_id ?? tx.bankSubAccId ?? tx.virtualAccountNumber ?? null,
      tx_time:
        parsedTxTime && !Number.isNaN(parsedTxTime.getTime())
          ? parsedTxTime.toISOString()
          : null,
      raw_payload: tx,
      status: matchedCode ? "matched" : "unmatched",
    };

    const { error } = await supabase.from("payment_events").insert(row);

    if (error) {
      if (
        error.code === "23505" ||
        /duplicate key/i.test(error.message ?? "")
      ) {
        skipped++;
        continue;
      }
      console.error("Insert payment_event failed:", error);
      errors.push(error.message);
      continue;
    }
    inserted++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      received: transactions.length,
      inserted,
      skipped,
      errors,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
