export interface FormProps {
  organizationId: string;
  onNotice: (message: string) => void;
  canWrite?: boolean;
}
