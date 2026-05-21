ALTER TABLE shipping_settings
    ADD COLUMN IF NOT EXISTS local_rules_json TEXT;

UPDATE shipping_settings
SET local_rules_json = '[{"enabled":true,"zoneCode":"LOCAL_MO_CAY","label":"Mỏ Cày local delivery","fee":0,"etaDays":{"min":1,"max":1},"provinceCodes":["83","86"],"provinceNames":["Bến Tre","Vĩnh Long"],"districtCodes":[],"districtNames":["Mỏ Cày","Mỏ Cày Nam","Huyện Mỏ Cày Nam"],"wardCodes":[],"wardNames":["Mỏ Cày","Thị trấn Mỏ Cày"]}]'
WHERE local_rules_json IS NULL
   OR btrim(local_rules_json) = ''
   OR btrim(local_rules_json) = '[]';

ALTER TABLE shipping_settings
    ALTER COLUMN local_rules_json SET DEFAULT '[]';

ALTER TABLE shipping_settings
    ALTER COLUMN local_rules_json SET NOT NULL;
