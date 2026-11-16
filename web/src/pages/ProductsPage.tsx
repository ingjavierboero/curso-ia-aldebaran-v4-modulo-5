import { Alert, Button, Form, Input, Modal, Popconfirm, Radio, Space, Table, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorText } from '../api/authApi';
import {
  CURRENCIES,
  CURRENCY_LABELS,
  PRICE_RULES,
  PRODUCT_NAME_MAX_LENGTH,
  canManageCatalog,
  formatPrice,
  toApiPrice,
  toInputPrice,
} from '../api/catalogRules';
import { createProduct, deactivateProduct, listProducts, reactivateProduct, updateProduct } from '../api/productsApi';
import type { Currency, Product } from '../api/types';
import { AppLayout } from '../components/AppLayout';
import { FormAlert, TitleRow } from '../components/PageParts';
import { StatusTag } from '../components/StatusTag';
import { useAuthStore } from '../store/authStore';
import { refreshSessionAfterForbidden } from '../store/refreshSession';

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({ label: CURRENCY_LABELS[currency], value: currency }));

/** Lo que se está editando en el modal: un alta, o la modificación de un producto. */
type Editing = { mode: 'create' } | { mode: 'edit'; product: Product };

/**
 * Pantalla de productos (FEAT-010): listado con el precio en formato es-AR y su moneda (en el orden
 * en que lo da el server), alta, modificación, desactivar y reactivar. La ven los tres perfiles; las
 * acciones de escritura solo Admin y Editor.
 *
 * Después de cada acción se recarga el listado. Un 401 ya lleva al login; cualquier otro error
 * muestra su texto y se conserva el listado anterior. Un 403 además refresca la sesión: si el perfil
 * cambió a Consulta, las acciones de escritura dejan de mostrarse.
 */
export function ProductsPage() {
  const canManage = canManageCatalog(useAuthStore((s) => s.user?.role));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  // Número de la última carga emitida: solo esa aplica su resultado.
  const lastLoad = useRef(0);

  const handleFailure = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) return;
    if (err instanceof ApiError && err.status === 403) void refreshSessionAfterForbidden();
    setError(errorText(err));
  }, []);

  const load = useCallback(async () => {
    const id = ++lastLoad.current;
    setLoading(true);
    try {
      const list = await listProducts();
      if (id === lastLoad.current) setProducts(list);
    } catch (err) {
      if (id === lastLoad.current) handleFailure(err);
    } finally {
      if (id === lastLoad.current) setLoading(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    void load();
    return () => {
      lastLoad.current++;
    };
  }, [load]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runAction(id: string, action: () => Promise<Product>) {
    setError(null);
    setBusy(id, true);
    try {
      await action();
    } catch (err) {
      handleFailure(err);
      return;
    } finally {
      setBusy(id, false);
    }
    await load();
  }

  const columns: TableColumnsType<Product> = [
    { title: 'Nombre', dataIndex: 'name', key: 'name' },
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
        <Space>
          <Button
            size="small"
            aria-label={`Modificar ${p.name}`}
            onClick={() => {
              setError(null);
              setEditing({ mode: 'edit', product: p });
            }}
          >
            Modificar
          </Button>
          {p.status === 'activo' ? (
            <Popconfirm
              title={`¿Desactivar ${p.name}?`}
              description="Sigue asignado a sus clientes, pero no se puede asignar a otros."
              okText="Confirmar"
              cancelText="Cancelar"
              onConfirm={() => {
                void runAction(p.id, () => deactivateProduct(p.id));
              }}
            >
              <Button size="small" danger aria-label={`Desactivar ${p.name}`} loading={busyIds.has(p.id)}>
                Desactivar
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              aria-label={`Reactivar ${p.name}`}
              loading={busyIds.has(p.id)}
              onClick={() => {
                void runAction(p.id, () => reactivateProduct(p.id));
              }}
            >
              Reactivar
            </Button>
          )}
        </Space>
      ),
    });
  }

  return (
    <AppLayout>
      <TitleRow>
        <Typography.Title level={3}>Productos</Typography.Title>
        {canManage && (
          <Button
            type="primary"
            onClick={() => {
              setError(null);
              setEditing({ mode: 'create' });
            }}
          >
            Nuevo producto
          </Button>
        )}
      </TitleRow>
      {error && <Alert type="error" title={error} showIcon />}
      <Table<Product> rowKey="id" columns={columns} dataSource={products} loading={loading} pagination={false} />
      {editing && (
        <ProductFormModal
          editing={editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </AppLayout>
  );
}

interface ProductFormValues {
  name: string;
  /** Texto tal como se escribe (coma o punto decimal); nunca se convierte a número. */
  price: string;
  currency: Currency;
}

/**
 * Formulario de alta o de modificación. El precio es un `Input` de texto validado (no un
 * `InputNumber`): se envía como texto con punto decimal. Los datos inválidos se marcan sin llamar a
 * la API; los errores del server y de red se muestran en el formulario, que sigue abierto.
 */
function ProductFormModal({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Editing;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<ProductFormValues>();
  const { token } = theme.useToken();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = editing.mode === 'create';
  const initialValues: Partial<ProductFormValues> =
    editing.mode === 'edit'
      ? {
          name: editing.product.name,
          price: toInputPrice(editing.product.price),
          currency: editing.product.currency,
        }
      : {};

  async function onFinish(values: ProductFormValues) {
    setSubmitting(true);
    setError(null);
    const input = { name: values.name, price: toApiPrice(values.price), currency: values.currency };
    try {
      if (editing.mode === 'edit') await updateProduct(editing.product.id, input);
      else await createProduct(input);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 403) void refreshSessionAfterForbidden();
      setError(errorText(err));
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open
      title={isCreate ? 'Nuevo producto' : 'Modificar producto'}
      okText="Guardar"
      cancelText="Cancelar"
      confirmLoading={submitting}
      onOk={() => {
        form.submit();
      }}
      onCancel={onCancel}
    >
      {error && <FormAlert $margin={token.margin} type="error" title={error} showIcon />}
      <Form<ProductFormValues>
        form={form}
        name="product-form"
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values) => {
          void onFinish(values);
        }}
        disabled={submitting}
        requiredMark={false}
      >
        <Form.Item
          label="Nombre"
          name="name"
          rules={[
            { required: true, whitespace: true, message: 'Ingresá el nombre' },
            { max: PRODUCT_NAME_MAX_LENGTH, message: `El nombre admite hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres` },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Precio" name="price" rules={PRICE_RULES} extra="Ejemplo: 15000,50">
          <Input autoComplete="off" inputMode="decimal" />
        </Form.Item>
        <Form.Item label="Moneda" name="currency" rules={[{ required: true, message: 'Elegí la moneda' }]}>
          <Radio.Group options={CURRENCY_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
