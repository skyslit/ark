export function joinPath(...args: string[]) {
  const allParts = args.reduce((acc, str) => {
    acc.push(...str.split('/').filter(Boolean));
    return acc;
  }, []);

  return `/${allParts.join('/')}`;
}
