export type OrderFile = {
  id: string;
  name: string;
  size: number;
  status: string;
  partsCompleted: number;
  partCount: number;
};

export type PublicOrder = {
  id: string;
  serviceHref: string;
  note: string | null;
  status: string;
  createdAt: string;
  senderName: string | null;
  senderEmail: string;
  files: OrderFile[];
};

export type IncomingFile = {
  name: string;
  size: number;
  type: string | null;
};
