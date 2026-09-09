export const AI_ASSIST_PERMISSION = "ai.assist";

export function canUseAiAssist(permissions: string[] | undefined): boolean {
  return permissions?.includes(AI_ASSIST_PERMISSION) ?? false;
}
