import { Tag } from 'antd';
import type { CatalogStatus } from '../api/types';

/** Estado Activo / Inactivo de un cliente o de un producto. */
export function StatusTag({ status }: { status: CatalogStatus }) {
  return status === 'activo' ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag>;
}
