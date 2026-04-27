import { PageHeader } from "@/components/shared/PageHeader";
export default function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return <PageHeader title={title} description={description || "Trang đang được phát triển"} />;
}
