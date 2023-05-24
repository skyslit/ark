export const getUniqueFileName = (items: any[], name: string) => {
  let uniqueName = name;

  let isScanning = true;
  let attempt = 0;
  while (isScanning === true) {
    const existingItem = items.find((item) => item.name === uniqueName);
    if (!existingItem) {
      isScanning = false;
      break;
    }

    attempt++;
    uniqueName = `${name} (${attempt})`;
  }

  return uniqueName;
};
