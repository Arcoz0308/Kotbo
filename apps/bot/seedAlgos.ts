import { prisma } from './src/utils/db.js';

const algos = [
  // Fondamentaux / Facile
  { title: "FizzBuzz", difficulty: "facile", language: "fr", description: "Écrivez un script qui retourne les nombres de 1 à 100. Pour les multiples de 3, remplacer par 'Fizz', pour les multiples de 5, par 'Buzz', et pour les multiples de 15, par 'FizzBuzz'.", solution: "for i in range(1, 101): print('FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else i)" },
  { title: "Inversion de chaîne", difficulty: "facile", language: "fr", description: "Créez une fonction qui prend une chaîne de caractères et la retourne inversée sans utiliser les fonctions natives comme `reverse()`.", solution: "def reverse_string(s): return s[::-1]" },
  { title: "Palindrome", difficulty: "facile", language: "fr", description: "Vérifier si un mot donné est un palindrome (se lit de la même manière dans les deux sens).", solution: "const isPalindrome = str => str === str.split('').reverse().join('');" },
  { title: "Somme d'un tableau", difficulty: "facile", language: "fr", description: "Retourner la somme de tous les entiers présents dans un tableau.", solution: "const sum = arr => arr.reduce((a, b) => a + b, 0);" },
  { title: "Nombre pair ou impair", difficulty: "facile", language: "fr", description: "Déterminer si un nombre donné est pair ou impair sans utiliser l'opérateur modulo `%`.", solution: "const isEven = n => (n & 1) === 0;" },
  { title: "Factorielle", difficulty: "facile", language: "fr", description: "Calculer la factorielle d'un nombre donné (ex: 5! = 120).", solution: "const fact = n => n <= 1 ? 1 : n * fact(n - 1);" },
  { title: "Fibonacci (Itératif)", difficulty: "facile", language: "fr", description: "Générer les N premiers éléments de la suite de Fibonacci de manière itérative.", solution: "function fib(n) { let a = 0, b = 1; for(let i=0; i<n; i++) { let temp = a; a = b; b = temp + b; } return a; }" },
  { title: "Recherche de la valeur max", difficulty: "facile", language: "fr", description: "Trouver le nombre le plus grand dans un tableau non trié.", solution: "const max = arr => Math.max(...arr);" },
  { title: "Compter les voyelles", difficulty: "facile", language: "fr", description: "Compter le nombre de voyelles dans une chaîne de caractères donnée.", solution: "const countVowels = str => (str.match(/[aeiouy]/gi) || []).length;" },
  { title: "Anagramme", difficulty: "facile", language: "fr", description: "Déterminer si deux chaînes de caractères sont des anagrammes l'une de l'autre.", solution: "const isAnagram = (str1, str2) => str1.split('').sort().join('') === str2.split('').sort().join('');" },
  
  // Défis par langages / Moyen
  { title: "Python: Compréhension de liste", difficulty: "moyen", language: "fr", description: "**En Python**, utilisez obligatoirement une compréhension de liste pour extraire tous les nombres pairs d'une liste `nums` et les élever au carré.", solution: "[x**2 for x in nums if x % 2 == 0]" },
  { title: "Rust: Pattern Matching", difficulty: "moyen", language: "fr", description: "**En Rust**, créez un `enum` Option customisé et utilisez `match` pour retourner une valeur par défaut de 0 si aucune valeur n'est présente.", solution: "match opt_val { Some(v) => v, None => 0 }" },
  { title: "JavaScript: Promesses", difficulty: "moyen", language: "fr", description: "**En JavaScript**, implémentez une fonction `sleep(ms)` qui retourne une Promesse se résolvant après le temps donné.", solution: "const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));" },
  { title: "Go: Goroutines", difficulty: "moyen", language: "fr", description: "**En Go**, lancez une goroutine qui envoie la chaîne 'Hello' dans un channel, puis lisez ce channel dans le thread principal.", solution: "ch := make(chan string)\ngo func() { ch <- \"Hello\" }()\nmsg := <-ch" },
  { title: "TypeScript: Génériques", difficulty: "moyen", language: "fr", description: "**En TypeScript**, créez une fonction générique `identity<T>` qui retourne le type exact de l'argument passé.", solution: "function identity<T>(arg: T): T { return arg; }" },
  { title: "C++: Pointeurs intelligents", difficulty: "moyen", language: "fr", description: "**En C++**, créez un `std::unique_ptr` contenant un entier de valeur 42 et transférez s'en la propriété (ownership) à une autre variable cible.", solution: "std::unique_ptr<int> p1 = std::make_unique<int>(42);\nstd::unique_ptr<int> p2 = std::move(p1);" },
  { title: "C#: LINQ Expressif", difficulty: "moyen", language: "fr", description: "**En C#**, utilisez LINQ pour ordonner une liste d'entiers par ordre décroissant et prendre les 3 premiers.", solution: "var top3 = list.OrderByDescending(x => x).Take(3);" },
  
  // Structures de données & Algorithmique / Moyen
  { title: "Recherche Binaire", difficulty: "moyen", language: "fr", description: "Implémenter efficacement l'algorithme de recherche dichotomique (binaire) sur un tableau trié. Complexité : O(log n).", solution: "def binary_search(arr, val):\n l, r = 0, len(arr)-1\n while l <= r:\n  m = (l+r)//2\n  if arr[m] == val: return m\n  elif arr[m] < val: l = m+1\n  else: r = m-1\n return -1" },
  { title: "Fusion de tableaux triés", difficulty: "moyen", language: "fr", description: "Fusionnez deux listes triées en une seule liste triée sans utiliser les fonctions de tri natives.", solution: "var res = [];\nwhile(a.length && b.length)\n res.push(a[0]<b[0]?a.shift():b.shift());\nreturn [...res,...a,...b];" },
  { title: "Parenthèses valides (Stack)", difficulty: "moyen", language: "fr", description: "Vérifier si une chaîne composée des caractères `()`, `{}`, et `[]` est bien formée et fermée dans le bon ordre en utilisant une pile (Stack).", solution: "Stack s; for c in str: if c in '({[': s.push(c) else if match(s.pop(), c) continue else return false; return s.empty()" },
  { title: "Tri à bulles (Bubble Sort)", difficulty: "moyen", language: "fr", description: "Implémentez l'algorithme de tri à bulles (Bubble Sort). Mettez en place une optimisation pour stopper le tri si aucun swap n'est effectué durant un passage.", solution: "for i=0 to n-1:\n swapped = false\n for j=0 to n-i-2:\n  if arr[j]>arr[j+1]: swap(arr[j], arr[j+1]); swapped=true\n if not swapped: break\nreturn arr" },
  { title: "Détection de cycle (Floyd)", difficulty: "moyen", language: "fr", description: "Utiliser l'algorithme du lièvre et de la tortue (Floyd's Tortoise and Hare) pour détecter un cycle dans une liste chainée.", solution: "slow = head; fast = head;\nwhile fast and fast.next:\n slow = slow.next; fast = fast.next.next;\n if slow == fast: return true\nreturn false" },
  { title: "Matrice spirale", difficulty: "moyen", language: "fr", description: "Parcourez une matrice NxM 2D d'entiers et retournez ses éléments dans l'ordre d'une spirale horaire.", solution: "while matrix:\n res += matrix.pop(0)\n matrix = list(zip(*matrix))[::-1]\nreturn res" },
  { title: "Nombres premiers (Crible)", difficulty: "moyen", language: "fr", description: "Utilisez le Crible d'Ératosthène pour trouver tous les nombres premiers strictement inférieurs à N.", solution: "primes = [True] * n\nfor p in range(2, int(n**0.5) + 1):\n if primes[p]:\n  for i in range(p*p, n, p): primes[i] = False\nreturn [p for p in range(2, n) if primes[p]]" },
  { title: "Longueur de la dernière chaîne", difficulty: "facile", language: "fr", description: "Trouver la longueur du dernier mot dans une phrase donnée (les mots sont séparés par des espaces).", solution: "const lengthOfLastWord = s => s.trim().split(' ').pop().length;" },
  { title: "Produit de l'Array sauf Soi", difficulty: "moyen", language: "fr", description: "Étant donné un tableau d'entiers, retournez un tableau dont chaque élément à l'indice i est le produit de tous les éléments du tableau original sauf `nums[i]`. Sans division et en O(n).", solution: "res = [1]*len(nums); p=1; for i in range(len(nums)): res[i]=p; p*=nums[i]\np=1; for i in range(len(nums)-1, -1, -1): res[i]*=p; p*=nums[i]\nreturn res" },
  { title: "Contient un doublon", difficulty: "facile", language: "fr", description: "Déterminez le plus rapidement possible si un tableau contient des doublons (O(n) attendu). L'utilisation d'une structure Set est conseillée.", solution: "const hasDuplicate = arr => new Set(arr).size !== arr.length;" },
  { title: "Majorité numérique", difficulty: "moyen", language: "fr", description: "Trouvez l'élément majoritaire d'un tableau (celui qui apparaît plus de n/2 fois). L'algorithme de vote de Boyer-Moore est fortement conseillé.", solution: "count = 0; candidate = None\nfor num in nums:\n if count == 0: candidate = num\n count += (1 if num == candidate else -1)\nreturn candidate" },
  { title: "Climb Stairs", difficulty: "facile", language: "fr", description: "Vous montez un escalier. Ça demande n étapes pour arriver en haut. À chaque fois vous pouvez monter 1 ou 2 marches. Combien de chemins distincts existent ?", solution: "a, b = 1, 1; for _ in range(n): a, b = b, a+b; return a" },
  
  // Avancé / Difficile
  { title: "Programmation Dynamique (Knapsack)", difficulty: "difficile", language: "fr", description: "Résolvez le problème du sac à dos (0/1 Knapsack) basique : max de valeur possible sous un poids limite `W`.", solution: "dp = [0]*(W+1)\nfor v, w in items:\n for j in range(W, w-1, -1):\n  dp[j] = max(dp[j], dp[j-w]+v)\nreturn dp[W]" },
  { title: "Tri Rapide (Quick Sort)", difficulty: "difficile", language: "fr", description: "Implémenter l'algorithme QuickSort avec choix de pivot. Expliquez la fonction pivot via des commentaires dans la réponse.", solution: "def qsort(arr):\n if len(arr) <= 1: return arr\n pivot = arr[len(arr)//2]\n left = [x for x in arr if x < pivot]\n middle = [x for x in arr if x == pivot]\n right = [x for x in arr if x > pivot]\n return qsort(left) + middle + qsort(right)" },
  { title: "Graphe : Plus court chemin (Dijkstra)", difficulty: "difficile", language: "fr", description: "Implémentez l'algorithme de Dijkstra pour trouver le plus court chemin depuis un nœud A vers tous les autres, avec une file de priorité.", solution: "priority_queue pq; dist[source]=0; pq.push({0, source});\nwhile (!pq.empty()) {\n int u = pq.top().second; pq.pop();\n for(auto &edge : adj[u]) {\n  int v = edge.to, weight = edge.weight;\n  if (dist[v] > dist[u] + weight) { dist[v] = dist[u] + weight; pq.push({dist[v], v}); }\n }\n}" },
  { title: "Sous-tableau à Somme Maximum (Kadane)", difficulty: "moyen", language: "fr", description: "Trouvez le sous-tableau contigu au sein d'un tableau d'entiers (pouvant inclure des négatifs) qui a la plus grande somme (Algorithme de Kadane).", solution: "curr_max = global_max = arr[0]\nfor x in arr[1:]:\n curr_max = max(x, curr_max + x)\n if curr_max > global_max: global_max = curr_max\nreturn global_max" },
  { title: "Sous-chaine sans répétition", difficulty: "difficile", language: "fr", description: "Trouver la longueur de la plus longue sous-chaine d'une chaine comportant des caractères tous distincts (Astuce : Sliding Window).", solution: "seen = {}; l = 0; ans = 0\nfor r, c in enumerate(s):\n if c in seen and seen[c] >= l: l = seen[c] + 1\n seen[c] = r\n ans = max(ans, r - l + 1)\nreturn ans" },
  { title: "Deep Clone (JS pur)", difficulty: "difficile", language: "fr", description: "**En JavaScript**, écrivez une fonction `deepClone` gérant les objets imbriqués, les tableaux et les dattes récursivement, sans `structuredClone` ni JSON.stringify.", solution: "function deepClone(obj) {\n if(obj === null || typeof obj !== 'object') return obj;\n if(obj instanceof Date) return new Date(obj.getTime());\n if(Array.isArray(obj)) return obj.map(deepClone);\n let cloned = {}; for(let key in obj) if(obj.hasOwnProperty(key)) cloned[key]=deepClone(obj[key]);\n return cloned;\n}" },
  { title: "SQL: N-ième salaire", difficulty: "moyen", language: "fr", description: "**En SQL**, écrivez une requête pour obtenir le N-ième salaire le plus élevé de la table `Employee` sans utiliser de sous-requêtes imbriquées (Utilisez LIMIT / OFFSET, ou RANK).", solution: "SELECT DISTINCT salary FROM Employee ORDER BY salary DESC LIMIT 1 OFFSET N-1;" },
  { title: "Aplatir un tableau infini", difficulty: "difficile", language: "fr", description: "Aplatissez sans utiliser la fonction native (`flat()`) un tableau contenant n'importe quel niveau de profondeur. Le faire avec une boucle ou générateur.", solution: "function* flatten(arr) {\n for (let item of arr) {\n  if (Array.isArray(item)) yield* flatten(item);\n  else yield item;\n }\n}" },
  { title: "Fusionner des intervalles", difficulty: "difficile", language: "fr", description: "Étant donné un tableau d'intervalles où intervalles[i] = [debut_i, fin_i], fusionnez tous les intervalles qui se chevauchent.", solution: "arr.sort((a,b)=>a[0]-b[0]);\nlet res = [arr[0]];\nfor(let curr of arr) {\n let prev = res[res.length-1];\n if (curr[0] <= prev[1]) prev[1] = Math.max(prev[1], curr[1]);\n else res.push(curr);\n}\nreturn res;" },
  
  // Bash & Scripts
  { title: "Bash: N-ième Ligne", difficulty: "moyen", language: "fr", description: "**En Bash/Shell**, affichez uniquement la 10ème ligne d'un fichier texte nommé `file.txt`.", solution: "sed -n '10p' file.txt" },
  { title: "Docker: Optimisation Multistage", difficulty: "difficile", language: "fr", description: "Écrivez un Dockerfile multi-stage minimal pour une application Go (ou JS) pour obtenir l'image en production la plus petite possible.", solution: "FROM golang:alpine AS builder\nWORKDIR /build\nCOPY . .\nRUN go build -o app .\nFROM scratch\nCOPY --from=builder /build/app /app\nENTRYPOINT [\"/app\"]" },

  // Fin
  { title: "Loto des algos", difficulty: "facile", language: "fr", description: "Écrire une fonction qui retourne 6 nombres entiers uniques, choisis aléatoirement entre 1 et 49 inclus.", solution: "const loto = () => {\n  const s = new Set();\n  while(s.size < 6) s.add(Math.floor(Math.random() * 49) + 1);\n  return [...s].sort((a,b) => a-b);\n};" },
  { title: "Taux de conversion hexadécimal", difficulty: "moyen", language: "fr", description: "Convertir une couleur '#RRGGBB' en sa valeur équivalente `rgb(R, G, B)`.", solution: "const hexToRgb = hex => {\n  const res = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);\n  return res ? `rgb(${parseInt(res[1], 16)}, ${parseInt(res[2], 16)}, ${parseInt(res[3], 16)})` : null;\n};" }
];

async function main() {
  console.log(`Starting to seed ${algos.length} Daily Algo problems...`);
  
  let inserted = 0;
  for (const algo of algos) {
    const existing = await prisma.dailyAlgoProblem.findFirst({
      where: {
        title: algo.title
      }
    });

    if (!existing) {
      await prisma.dailyAlgoProblem.create({
        data: {
          title: algo.title,
          description: algo.description,
          solution: algo.solution,
          difficulty: algo.difficulty,
          language: algo.language,
        }
      });
      inserted++;
    }
  }

  console.log(`✅ Seed complete! Inserted ${inserted} new algorithms.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
