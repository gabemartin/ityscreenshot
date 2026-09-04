/** Copies text to the clipboard. Returns false (and swallows the error) if unsupported/denied. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
