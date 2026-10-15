/** Client + server safe path check for the Pixelcare AI Assistant (BETA). */
export function isPixelcareAiWorkspacePath(pathname: string): boolean {
  return pathname === "/internal/ai" || pathname.startsWith("/internal/ai/");
}
