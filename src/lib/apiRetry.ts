/**
 * Retry helper voor API calls die kunnen falen door sessie issues
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check of het een auth/sessie fout is
      const isAuthError = 
        error?.message?.includes('JWT') ||
        error?.message?.includes('session') ||
        error?.message?.includes('auth') ||
        error?.code === 'PGRST301';
      
      // Als het geen auth error is, of dit was de laatste poging, gooi de error
      if (!isAuthError || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Wacht met exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} voor API call`);
    }
  }
  
  throw lastError;
}
