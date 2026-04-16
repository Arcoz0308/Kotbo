ALTER TABLE "daily_algo_problems"
ADD COLUMN IF NOT EXISTS "functionName" TEXT,
ADD COLUMN IF NOT EXISTS "functionArgs" JSONB,
ADD COLUMN IF NOT EXISTS "unitTests" JSONB,
ADD COLUMN IF NOT EXISTS "allowedLanguages" TEXT[] NOT NULL DEFAULT ARRAY['javascript']::TEXT[],
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "daily_algo_problems"
SET
  "functionName" = COALESCE(NULLIF("functionName", ''), 'solve'),
  "functionArgs" = COALESCE("functionArgs", '[]'::jsonb),
  "unitTests" = COALESCE("unitTests", '[]'::jsonb),
  "allowedLanguages" = CASE
    WHEN "allowedLanguages" IS NULL OR cardinality("allowedLanguages") = 0
      THEN ARRAY['javascript', 'typescript', 'python']::TEXT[]
    ELSE "allowedLanguages"
  END,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "daily_algo_problems"
SET
  "functionName" = 'reverseString',
  "functionArgs" = '[{"name":"input","type":"string"}]'::jsonb,
  "unitTests" = $$[
    {"name":"mot simple","args":["hello"],"expected":"olleh"},
    {"name":"palindrome","args":["racecar"],"expected":"racecar"},
    {"name":"chaine vide","args":[""],"expected":""},
    {"name":"mot accentue","args":["cafe"],"expected":"efac"}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Inverser une chaîne';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'fibonacci',
  "functionArgs" = '[{"name":"n","type":"number"}]'::jsonb,
  "unitTests" = $$[
    {"name":"fibo 0","args":[0],"expected":0},
    {"name":"fibo 1","args":[1],"expected":1},
    {"name":"fibo 7","args":[7],"expected":13},
    {"name":"fibo 10","args":[10],"expected":55}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Fibonacci';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'isPalindrome',
  "functionArgs" = '[{"name":"input","type":"string"}]'::jsonb,
  "unitTests" = $$[
    {"name":"palindrome simple","args":["kayak"],"expected":true},
    {"name":"palindrome avec espaces","args":["Never odd or even"],"expected":true},
    {"name":"pas palindrome","args":["hello"],"expected":false}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Vérifier un palindrome';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'twoSum',
  "functionArgs" = '[{"name":"nums","type":"number[]"},{"name":"target","type":"number"}]'::jsonb,
  "unitTests" = $$[
    {"name":"cas classique","args":[[2,7,11,15],9],"expected":[0,1]},
    {"name":"valeurs dupliquees","args":[[3,3],6],"expected":[0,1]},
    {"name":"autre tableau","args":[[3,2,4],6],"expected":[1,2]}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Deux sommes';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'isValidParentheses',
  "functionArgs" = '[{"name":"input","type":"string"}]'::jsonb,
  "unitTests" = $$[
    {"name":"valide simple","args":["()[]{}"],"expected":true},
    {"name":"ordre invalide","args":["([)]"],"expected":false},
    {"name":"imbrique valide","args":["{[()]}"],"expected":true}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Parenthèses valides';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'isPrime',
  "functionArgs" = '[{"name":"n","type":"number"}]'::jsonb,
  "unitTests" = $$[
    {"name":"2 est premier","args":[2],"expected":true},
    {"name":"9 n est pas premier","args":[9],"expected":false},
    {"name":"17 est premier","args":[17],"expected":true},
    {"name":"1 n est pas premier","args":[1],"expected":false}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Nombre premier';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'maxInArray',
  "functionArgs" = '[{"name":"values","type":"number[]"}]'::jsonb,
  "unitTests" = $$[
    {"name":"valeurs positives","args":[[1,4,2,9,3]],"expected":9},
    {"name":"valeurs negatives","args":[[-5,-1,-9]],"expected":-1},
    {"name":"singleton","args":[[42]],"expected":42}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Maximum de tableau';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'mergeSortedArrays',
  "functionArgs" = '[{"name":"left","type":"number[]"},{"name":"right","type":"number[]"}]'::jsonb,
  "unitTests" = $$[
    {"name":"fusion classique","args":[[1,3,5],[2,4,6]],"expected":[1,2,3,4,5,6]},
    {"name":"tableau vide gauche","args":[[],[1,2]],"expected":[1,2]},
    {"name":"tableau vide droite","args":[[1,2],[]],"expected":[1,2]}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Fusionner deux tableaux triés';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'areAnagrams',
  "functionArgs" = '[{"name":"a","type":"string"},{"name":"b","type":"string"}]'::jsonb,
  "unitTests" = $$[
    {"name":"anagramme simple","args":["chien","niche"],"expected":true},
    {"name":"pas anagramme","args":["chat","chien"],"expected":false},
    {"name":"casse et espaces","args":["Dormitory","Dirty room"],"expected":true}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Anagrammes';

UPDATE "daily_algo_problems"
SET
  "functionName" = 'maxSubarraySum',
  "functionArgs" = '[{"name":"values","type":"number[]"}]'::jsonb,
  "unitTests" = $$[
    {"name":"kadane classique","args":[[-2,1,-3,4,-1,2,1,-5,4]],"expected":6},
    {"name":"tout negatif","args":[[-8,-3,-6,-2,-5,-4]],"expected":-2},
    {"name":"tout positif","args":[[1,2,3,4]],"expected":10}
  ]$$::jsonb,
  "allowedLanguages" = ARRAY['javascript', 'typescript', 'python']::TEXT[],
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Sous-tableau avec somme max';

CREATE INDEX IF NOT EXISTS "daily_algo_problems_updatedAt_idx" ON "daily_algo_problems"("updatedAt");
