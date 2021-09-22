/* This is not exactly clever but it works most of the time
 * we receive the full text of the npm script, and we look if we can find the cli flag
 */
export default function getStorybookConfiguration(storybookScript, shortName, longName) {
  const parts = storybookScript.split(/[\s='"]+/);
  let index = parts.indexOf(longName);
  if (index === -1) {
    index = parts.indexOf(shortName);
  }
  if (index === -1) {
    return null;
  }
  return parts[index + 1];
}
