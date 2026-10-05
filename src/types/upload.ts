export type UploadTarget = {
  id: string;
  name: string;
  size: number;
  partSize: number;
  partCount: number;
  mode: "presigned" | "direct";
};
