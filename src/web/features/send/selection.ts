import { MAX_FILE_BYTES } from "../../../shared/contracts";
export const MAX_QUEUE_FILES = 100;
export interface SelectedFile {
  id: string;
  file: File;
  selected: boolean;
}
export function addFiles(
  current: SelectedFile[],
  incoming: Iterable<File>,
): { items: SelectedFile[]; errors: string[] } {
  const items = [...current],
    errors: string[] = [];
  for (const file of incoming) {
    if (!file.size || file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 1 GiB`);
      continue;
    }
    if (items.length >= MAX_QUEUE_FILES) {
      errors.push("เลือกได้สูงสุด 100 ไฟล์ต่อชุด");
      break;
    }
    items.push({ id: crypto.randomUUID(), file, selected: true });
  }
  return { items, errors };
}
export function toggleFile(
  items: SelectedFile[],
  id: string,
  selected: boolean,
): SelectedFile[] {
  return items.map((item) => (item.id === id ? { ...item, selected } : item));
}
export function selectedFiles(items: SelectedFile[]): File[] {
  return items.filter((item) => item.selected).map((item) => item.file);
}
