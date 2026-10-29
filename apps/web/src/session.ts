// Signed out is a stable session state, not a failed query. Keeping it as
// cached data prevents background checks from unmounting the sign-in form.
export async function readSession<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if ((error as { status?: number })?.status === 401) return null;
    throw error;
  }
}
