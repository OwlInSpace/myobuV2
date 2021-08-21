export async function shouldRevert(
  func: () => void,
  errorMessage?: string
): Promise<void> {
  try {
    await func()
  } catch {
    return
  }
  throw new Error(errorMessage)
}
