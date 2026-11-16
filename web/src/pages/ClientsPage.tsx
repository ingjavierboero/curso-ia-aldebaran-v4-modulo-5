import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, errorText } from '../api/authApi';
import {
  BILLING_EMAIL_MAX_LENGTH,
  CLIENT_ADDRESS_MAX_LENGTH,
  CLIENT_BUSINESS_NAME_MAX_LENGTH,
  CUIT_MAX_LENGTH,
  CUIT_RULES,
  IVA_CONDITIONS,
  canManageCatalog,
  formatCuit,
  normalizeCuit,
} from '../api/catalogRules';
import { createClient, deactivateClient, listClients, reactivateClient, updateClient } from '../api/clientsApi';
import type { Client, CreateClientInput } from '../api/types';
import { AppLayout } from '../components/AppLayout';
import { FormAlert, TitleRow } from '../components/PageParts';
import { StatusTag } from '../components/StatusTag';
import { useAuthStore } from '../store/authStore';
import { refreshSessionAfterForbidden } from '../store/refreshSession';

const IVA_OPTIONS = IVA_CONDITIONS.map((condition) => ({ label: condition.name, value: condition.code }));

/** Lo que se está editando en el modal: un alta, o la modificación de un cliente. */
type Editing = { mode: 'create' } | { mode: 'edit'; client: Client };

/**
 * Pantalla de clientes (FEAT-010): listado (en el orden en que lo da el server), alta, modificación,
 * baja y reactivación. La ven los tres perfiles; las acciones de escritura solo Admin y Editor (para
 * Consulta no se muestran y el server igual las rechaza).
 *
 * Después de cada acción se recarga el listado. Un 401 ya lleva al login (`client`); cualquier otro
 * error muestra su texto (el mensaje del server, o el genérico de red / respuesta inválida) y se
 * conserva el listado anterior. Un 403 además refresca la sesión: si el perfil cambió a Consulta, las
 * acciones de escritura dejan de mostrarse.
 */
export function ClientsPage() {
  const canManage = canManageCatalog(useAuthStore((s) => s.user?.role));
  const [clients, setClients] = useState<Client[]>([]);
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
      const list = await listClients();
      if (id === lastLoad.current) setClients(list);
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

  async function runAction(id: string, action: () => Promise<Client>) {
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

  const columns: TableColumnsType<Client> = [
    {
      title: 'Razón social',
      key: 'businessName',
      render: (_, c) => <Link to={`/clientes/${encodeURIComponent(c.id)}`}>{c.businessName}</Link>,
    },
    { title: 'CUIT', key: 'cuit', render: (_, c) => formatCuit(c.cuit) },
    { title: 'Email de facturación', dataIndex: 'billingEmail', key: 'billingEmail' },
    { title: 'Condición IVA', key: 'ivaCondition', render: (_, c) => c.ivaCondition.name },
    {
      title: 'Estado',
      key: 'status',
      render: (_, c) => <StatusTag status={c.status} />,
    },
  ];
  if (canManage) {
    columns.push({
      title: 'Acciones',
      key: 'actions',
      render: (_, c) => (
        <Space>
          <Button
            size="small"
            aria-label={`Modificar a ${c.businessName}`}
            onClick={() => {
              setError(null);
              setEditing({ mode: 'edit', client: c });
            }}
          >
            Modificar
          </Button>
          {c.status === 'activo' ? (
            <Popconfirm
              title={`¿Dar de baja a ${c.businessName}?`}
              description="Pasa a Inactivo: no se le factura ni se le envían emails."
              okText="Confirmar"
              cancelText="Cancelar"
              onConfirm={() => {
                void runAction(c.id, () => deactivateClient(c.id));
              }}
            >
              <Button size="small" danger aria-label={`Dar de baja a ${c.businessName}`} loading={busyIds.has(c.id)}>
                Dar de baja
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              aria-label={`Reactivar a ${c.businessName}`}
              loading={busyIds.has(c.id)}
              onClick={() => {
                void runAction(c.id, () => reactivateClient(c.id));
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
        <Typography.Title level={3}>Clientes</Typography.Title>
        {canManage && (
          <Button
            type="primary"
            onClick={() => {
              setError(null);
              setEditing({ mode: 'create' });
            }}
          >
            Nuevo cliente
          </Button>
        )}
      </TitleRow>
      {error && <Alert type="error" title={error} showIcon />}
      <Table<Client> rowKey="id" columns={columns} dataSource={clients} loading={loading} pagination={false} />
      {editing && (
        <ClientFormModal
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

interface ClientFormValues {
  businessName: string;
  cuit: string;
  address: string;
  billingEmail: string;
  ivaCondition: number;
}

/**
 * Formulario de alta o de modificación. Los datos inválidos se marcan sin llamar a la API; los
 * errores del server (400, 403, 404, 409) y de red se muestran en el formulario, que sigue abierto.
 */
function ClientFormModal({
  editing,
  onCancel,
  onSaved,
}: {
  editing: Editing;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<ClientFormValues>();
  const { token } = theme.useToken();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = editing.mode === 'create';
  const initialValues: Partial<ClientFormValues> =
    editing.mode === 'edit'
      ? {
          businessName: editing.client.businessName,
          cuit: editing.client.cuit,
          address: editing.client.address,
          billingEmail: editing.client.billingEmail,
          ivaCondition: editing.client.ivaCondition.code,
        }
      : {};

  async function onFinish(values: ClientFormValues) {
    setSubmitting(true);
    setError(null);
    const input: CreateClientInput = {
      businessName: values.businessName,
      cuit: normalizeCuit(values.cuit),
      address: values.address,
      billingEmail: values.billingEmail,
      ivaCondition: values.ivaCondition,
    };
    try {
      if (editing.mode === 'edit') await updateClient(editing.client.id, input);
      else await createClient(input);
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
      title={isCreate ? 'Nuevo cliente' : 'Modificar cliente'}
      okText="Guardar"
      cancelText="Cancelar"
      confirmLoading={submitting}
      onOk={() => {
        form.submit();
      }}
      onCancel={onCancel}
    >
      {error && <FormAlert $margin={token.margin} type="error" title={error} showIcon />}
      <Form<ClientFormValues>
        form={form}
        name="client-form"
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values) => {
          void onFinish(values);
        }}
        disabled={submitting}
        requiredMark={false}
      >
        <Form.Item
          label="Razón social"
          name="businessName"
          rules={[
            { required: true, whitespace: true, message: 'Ingresá la razón social' },
            {
              max: CLIENT_BUSINESS_NAME_MAX_LENGTH,
              message: `La razón social admite hasta ${CLIENT_BUSINESS_NAME_MAX_LENGTH} caracteres`,
            },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="CUIT" name="cuit" rules={CUIT_RULES}>
          <Input autoComplete="off" maxLength={CUIT_MAX_LENGTH} />
        </Form.Item>
        <Form.Item
          label="Domicilio"
          name="address"
          rules={[
            { required: true, whitespace: true, message: 'Ingresá el domicilio' },
            {
              max: CLIENT_ADDRESS_MAX_LENGTH,
              message: `El domicilio admite hasta ${CLIENT_ADDRESS_MAX_LENGTH} caracteres`,
            },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Email de facturación"
          name="billingEmail"
          rules={[
            { required: true, message: 'Ingresá el email de facturación' },
            { type: 'email', message: 'El email no tiene un formato válido' },
            { max: BILLING_EMAIL_MAX_LENGTH, message: `El email admite hasta ${BILLING_EMAIL_MAX_LENGTH} caracteres` },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Condición frente al IVA"
          name="ivaCondition"
          rules={[{ required: true, message: 'Elegí la condición frente al IVA' }]}
        >
          {/* Sin lista virtual: son 11 opciones. */}
          <Select options={IVA_OPTIONS} virtual={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
