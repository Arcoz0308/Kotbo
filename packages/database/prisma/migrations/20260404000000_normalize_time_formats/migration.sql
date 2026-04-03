UPDATE guilds
SET "digestTime" = 
  CASE
    WHEN "digestTime" ~ '^[0-9]:[0-5][0-9]$' THEN '0' || "digestTime"
    WHEN "digestTime" ~ '^[0-2][0-3]$' THEN "digestTime" || ':00'
    WHEN "digestTime" ~ '^[0-9]$' THEN '0' || "digestTime" || ':00'
    WHEN "digestTime" ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$' THEN "digestTime"
    ELSE '08:00'
  END
WHERE "digestTime" IS NOT NULL AND "digestTime" NOT LIKE '\_%';

UPDATE guilds
SET "dailyAlgoTime" = 
  CASE
    WHEN "dailyAlgoTime" ~ '^[0-9]:[0-5][0-9]$' THEN '0' || "dailyAlgoTime"
    WHEN "dailyAlgoTime" ~ '^[0-2][0-3]$' THEN "dailyAlgoTime" || ':00'
    WHEN "dailyAlgoTime" ~ '^[0-9]$' THEN '0' || "dailyAlgoTime" || ':00'
    WHEN "dailyAlgoTime" ~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$' THEN "dailyAlgoTime"
    ELSE '09:00'
  END
WHERE "dailyAlgoTime" IS NOT NULL AND "dailyAlgoTime" NOT LIKE '\_%';
