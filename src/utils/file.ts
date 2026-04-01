export const normalizeFilePath = (path: string): string => {
  if (path.startsWith('file://')) {
    return path.replace('file://', '');
  }
  return path;
};
