async function translate(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json() as any;
  return json[0][0][0];
}

console.log(await translate("Bonjour tout le monde !"));
console.log(await translate("Vérifie la latence du bot"));
