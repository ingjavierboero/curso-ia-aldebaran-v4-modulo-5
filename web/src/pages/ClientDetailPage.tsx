import { Alert, Button, Descriptions, Form, Popconfirm, Select, Table, Typography } from 'antd';
import type { DescriptionsProps, TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import styled from 'styled-components';
import { ApiError, errorText } from '../api/authApi';
import { canManageCatalog, formatCuit, formatDate, formatPrice } from '../api/catalogRules';
import { assignProducts, getClient, unassignProduct } from '../api/clientsApi';
import { listProducts } from '../api/productsApi';
import type { ClientDetail, Product } from '../api/types';
import { AppLayout } from '../components/AppLayout';
import { StatusTag } from '../components/StatusTag';
import { useAuthStore } from '../store/authStore';
import { refreshSessionAfterForbidden } from '../store/refreshSession';

const ASSIGN_FIELD_ID = 'assign-products';

/**
 * Detalle de un cliente (FEAT-010): sus datos y los productos asignados (Activos e Inactivos, en el
 * orden del server). Admin y Editor además asignan (solo productos Activos que no tiene asignados) y
 * desasignan; para Consulta esas acciones no se muestran y no se pide el listado de productos.
 *
 * Un 401 ya lleva al login; cualquier otro error (400, 403, 404, 409, red o respuesta inválida)
 * muestra su texto en la pantalla. Un 403 además refresca la sesión (el perfil cambió) y un 409 al
 * asignar recarga los productos.
 */
export function ClientDetailPage() {
  const { id = '' } = useParams();
  const canManage = canManageCatalog(useAuthStore((s) => s.user?.role));
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  // Número de la última carga emitida (del detalle y de los productos): solo esa aplica su resultado.
  const lastLoad = useRef(0);
  const lastProductsLoad = useRef(0);

  const handleFailure = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) return;
    if (err instanceof ApiError && err.status === 403) void refreshSessionAfterForbidden();
    setError(errorText(err));
  }, []);

  const load = useCallback(async () => {
    const loadId = ++lastLoad.current;
    setLoading(true);
    try {
      const detail = await getClient(id);
      if (loadId === lastLoad.current) setClient(detail);
    } catch (err) {
      if (loadId === lastLoad.current) handleFailure(err);
    } finally {
      if (loadId === lastLoad.current) setLoading(false);
    }
  }, [id, handleFailure]);

  useEffect(() => {
    void load();
    return () => {
      lastLoad.current++;
    };
  }, [load]);

  /** Productos para asignar; gana la última carga emitida. */
  const loadProducts = useCallback(async () => {
    const loadId = ++lastProductsLoad.current;
    try {
      const list = await listProducts();
      if (loadId === lastProductsLoad.current) setProducts(list);
    } catch (err) {
      if (loadId === lastProductsLoad.current) handleFailure(err);
    }
  }, [handleFailure]);

  // Los productos para asignar solo hacen falta a quien puede asignar.
  useEffect(() => {
    if (!canManage) return;
    void loadProducts();
    return () => {
      lastProductsLoad.current++;
    };
  }, [canManage, loadProducts]);

  async function onAssign() {
    setError(null);
    setAssigning(true);
    try {
      const detail = await assignProducts(id, selected);
      setClient(detail);
      setSelected([]);
    } catch (err) {
      handleFailure(err);
      // 409: un producto elegido se desactivó o ya se asignó desde otra sesión. Se vacía la elección
      // y se recargan los productos para que la opción vieja deje de ofrecerse.
      if (err instanceof ApiError && err.status === 409) {
        setSelected([]);
        void loadProducts();
      }
    } finally {
      setAssigning(false);
    }
  }

  async function onUnassign(productId: string) {
    setError(null);
    setBusyIds((prev) => new Set(prev).add(productId));
    try {
      await unassignProduct(id, productId);
    } catch (err) {
      handleFailure(err);
      return;
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
    await load();
  }

  const assignedIds = new Set(client?.products.map((p) => p.id));
  const assignOptions = products
    .filter((p) => p.status === 'activo' && !assignedIds.has(p.id))
    .map((p) => ({ label: p.name, value: p.id }));

  const columns: TableColumnsType<Product> = [
    { title: 'Producto', dataIndex: 'name', key: 'name' },
    { title: 'Precio', key: 'price', render: (_, p) => formatPrice(p.price, p.currency) },
    { title: 'Moneda', dataIndex: 'currency', key: 'currency' },
    {
      title: 'Estado',
      key: 'status',
      render: (_, p) => <StatusTag status={p.status} />,
    },
  ];
  if (canManage) {
    columns.push({
      title: 'Acciones',
      key: 'actions',
      render: (_, p) => (
        <Popconfirm
          title={`¿Desasignar ${p.name}?`}
          description="Deja de facturarse a este cliente."
          okText="Confirmar"
          cancelText="Cancelar"
          onConfirm={() => {
            void onUnassign(p.id);
          }}
        >
          <Button size="small" danger aria-label={`Desasignar ${p.name}`} loading={busyIds.has(p.id)}>
            Desasignar
          </Button>
        </Popconfirm>
      ),
    });
  }

  const items: DescriptionsProps['items'] = client
    ? [
        { key: 'cuit', label: 'CUIT', children: formatCuit(client.cuit) },
        { key: 'address', label: 'Domicilio', children: client.address },
        { key: 'billingEmail', label: 'Email de facturación', children: client.billingEmail },
        { key: 'ivaCondition', label: 'Condición frente al IVA', children: client.ivaCondition.name },
        { key: 'status', label: 'Estado', children: <StatusTag status={client.status} /> },
        { key: 'createdAt', label: 'Fecha de alta', children: formatDate(client.createdAt) },
      ]
    : [];

  return (
    <AppLayout>
      <Link to="/clientes">Volver a clientes</Link>
      {error && <Alert type="error" title={error} showIcon />}
      {client && (
        <>
          <Typography.Title level={3}>{client.businessName}</Typography.Title>
          <Descriptions column={1} items={items} />
          <Typography.Title level={4}>Productos asignados</Typography.Title>
          {canManage && (
            <Form layout="inline">
              <AssignField label="Productos para asignar" htmlFor={ASSIGN_FIELD_ID}>
                {/* Sin lista virtual: en jsdom y con pocas opciones no aporta nada. */}
                <Select<string[]>
                  id={ASSIGN_FIELD_ID}
                  mode="multiple"
                  virtual={false}
                  options={assignOptions}
                  value={selected}
                  onChange={setSelected}
                  placeholder="Elegí uno o más productos Activos"
                  disabled={assigning}
                />
              </AssignField>
              <Form.Item>
                <Button
                  type="primary"
                  disabled={selected.length === 0}
                  loading={assigning}
                  onClick={() => {
                    void onAssign();
                  }}
                >
                  Asignar
                </Button>
              </Form.Item>
            </Form>
          )}
        </>
      )}
      {(client || loading) && (
        <Table<Product>
          rowKey="id"
          columns={columns}
          dataSource={client?.products ?? []}
          loading={loading}
          pagination={false}
        />
      )}
    </AppLayout>
  );
}

/** El selector múltiple necesita ancho para mostrar los productos elegidos. */
const AssignField = styled(Form.Item)`
  .ant-select {
    min-width: 280px;
  }
`;
