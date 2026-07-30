const CUSTOM_EMOJI_MARKUP = /<a?:\w+:\d+>/g;

/**
 * Calcule la proportion de majuscules dans le texte réellement écrit.
 * Le nom technique d'un emoji Discord ne doit pas compter comme du contenu.
 */
export function getUppercasePercentage(content: string, minLetters: number): number | null {
  const textWithoutCustomEmojis = content.replace(CUSTOM_EMOJI_MARKUP, '');
  const letters = textWithoutCustomEmojis.replace(/[^a-zA-Z]/g, '');

  if (letters.length < minLetters) {
    return null;
  }

  const uppercaseLetters = letters.replace(/[^A-Z]/g, '');
  return (uppercaseLetters.length / letters.length) * 100;
}
