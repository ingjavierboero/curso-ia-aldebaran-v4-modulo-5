import { Alert, Button, Form, Input, Modal, Popconfirm, Radio, Space, Table, Tag, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import styled from 'styled-components';
import { ApiError, errorText, getSession } from '../api/authApi';
import type { PublicUser, UserRole } from '../api/types';
import {
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_PASSWORD_MIN_LENGTH,
  USER_ROLES,
} from '../api/userRules';
import { createUser, deactivateUser, listUsers, reactivateUser, updateUser } from '../api/usersApi';
import { AppLayout, layoutNoticeState } from '../components/AppLayout';
import { useAuthStore } from '../store/authStore';

const ROLE_LABELS: Record<UserRole, string> = { admin: 'Admin', editor: 'Editor', consulta: 'Consulta' };

const ROLE_OPTIONS = USER_ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role }));

/** Lo que se está editando en el modal: un alta, o la modificación de un usuario. */
type Editing = { mode: 'create' } | { mode: 'edit'; user: PublicUser };

/**
 * Pantalla de usuarios (FEAT-006, FR-13): listado, alta, modificación, baja y reactivación. Solo
 * para Admin: la guarda es el loader de `/usuarios` y la autorización real la hace el server.
 *
 * Después de cada acción se recarga el listado. Ante un error:
 * - 400 / 409 → el mensaje del server, y el listado no cambia;
 * - 403 (el perfil cambió con la pantalla abierta) → se refresca el usuario y se vuelve a `/` con un aviso;
 * - 401 → el cliente ya lleva al login;
 * - red o respuesta inválida → "No se pudo conectar con el servidor", y se conserva el listado anterior.
 */
export function UsersPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // Filas con una acción en curso: cada una termina por su cuenta sin apagar el spinner de otra.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  // Número de la última carga del listado emitida: solo esa aplica su resultado.
  const lastLoad = useRef(0);

  const leaveForbidden = useCallback(
    async (text: string) => {
      try {
        // El botón "Usuarios" depende del perfil del store: se refresca antes de salir.
        setUser(await getSession());
      } catch (err) {
        // Un 401 ya llevó al login; ante otro error, el loader de `/` vuelve a consultar.
        if (err instanceof ApiError && err.status === 401) return;
      }
      void navigate('/', { replace: true, state: layoutNoticeState(text) });
    },
    [navigate, setUser],
  );

  const handleFailure = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 403) {
        void leaveForbidden(err.message);
        return;
      }
      setError(errorText(err));
    },
    [leaveForbidden],
  );

  /**
   * Carga el listado. Gana la última carga emitida: una respuesta de una carga anterior que llega
   * tarde (más lenta) se descarta, así nunca pisa un listado más nuevo; tampoco se aplica nada tras
   * desmontar.
   */
  const load = useCallback(async () => {
    const id = ++lastLoad.current;
    setLoading(true);
    try {
      const list = await listUsers();
      if (id === lastLoad.current) setUsers(list);
    } catch (err) {
      if (id === lastLoad.current) handleFailure(err);
    } finally {
      if (id === lastLoad.current) setLoading(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    void load();
    return () => {
      // Invalida la carga en vuelo al desmontar.
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

  async function runAction(id: string, action: () => Promise<PublicUser>) {
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

  const columns: TableColumnsType<PublicUser> = [
    { title: 'Nombre', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Perfil', key: 'role', render: (_, u) => ROLE_LABELS[u.role] },
    {
      title: 'Estado',
      key: 'status',
      render: (_, u) =>
        u.status === 'activo' ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag>,
    },
    {
      title: 'Acciones',
      key: 'actions',
      render: (_, u) => (
        <Space>
          <Button
            size="small"
            aria-label={`Modificar a ${u.name}`}
            onClick={() => {
              setError(null);
              setEditing({ mode: 'edit', user: u });
            }}
          >
            Modificar
          </Button>
          {u.status === 'activo' ? (
            <Popconfirm
              title={`¿Dar de baja a ${u.name}?`}
              description="Pasa a Inactivo y se cierran todas sus sesiones."
              okText="Confirmar"
              cancelText="Cancelar"
              onConfirm={() => {
                void runAction(u.id, () => deactivateUser(u.id));
              }}
            >
              <Button size="small" danger aria-label={`Dar de baja a ${u.name}`} loading={busyIds.has(u.id)}>
                Dar de baja
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              aria-label={`Reactivar a ${u.name}`}
              loading={busyIds.has(u.id)}
              onClick={() => {
                void runAction(u.id, () => reactivateUser(u.id));
              }}
            >
              Reactivar
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <TitleRow>
        <Typography.Title level={3}>Usuarios</Typography.Title>
        <Button
          type="primary"
          onClick={() => {
            setError(null);
            setEditing({ mode: 'create' });
          }}
        >
          Nuevo usuario
        </Button>
      </TitleRow>
      {error && <Alert type="error" title={error} showIcon />}
      <Table<PublicUser> rowKey="id" columns={columns} dataSource={users} loading={loading} pagination={false} />
      {editing && (
        <UserFormModal
          editing={editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onFailure={handleFailure}
        />
      )}
    </AppLayout>
  );
}

interface UserFormValues {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
}

/**
 * Formulario de alta o de modificación. La contraseña inicial solo se pide en el alta. Los 400/409
 * y los errores de red se muestran en el formulario, que sigue abierto; 401 y 403 los maneja la pantalla.
 */
function UserFormModal({
  editing,
  onCancel,
  onSaved,
  onFailure,
}: {
  editing: Editing;
  onCancel: () => void;
  onSaved: () => void;
  onFailure: (err: unknown) => void;
}) {
  const [form] = Form.useForm<UserFormValues>();
  const { token } = theme.useToken();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = editing.mode === 'create';
  const initialValues: Partial<UserFormValues> =
    editing.mode === 'edit' ? { name: editing.user.name, email: editing.user.email, role: editing.user.role } : {};

  async function onFinish(values: UserFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      if (editing.mode === 'edit') {
        await updateUser(editing.user.id, { name: values.name, email: values.email, role: values.role });
      } else {
        await createUser({ name: values.name, email: values.email, role: values.role, password: values.password ?? '' });
      }
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onFailure(err);
        return;
      }
      setError(errorText(err));
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open
      title={isCreate ? 'Nuevo usuario' : 'Modificar usuario'}
      okText="Guardar"
      cancelText="Cancelar"
      confirmLoading={submitting}
      onOk={() => {
        form.submit();
      }}
      onCancel={onCancel}
    >
      {error && <FormAlert $margin={token.margin} type="error" title={error} showIcon />}
      <Form<UserFormValues>
        form={form}
        name="user-form"
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
            { max: USER_NAME_MAX_LENGTH, message: `El nombre admite hasta ${USER_NAME_MAX_LENGTH} caracteres` },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Email"
          name="email"
          rules={[
            { required: true, message: 'Ingresá el email' },
            { type: 'email', message: 'El email no tiene un formato válido' },
            { max: USER_EMAIL_MAX_LENGTH, message: `El email admite hasta ${USER_EMAIL_MAX_LENGTH} caracteres` },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Perfil" name="role" rules={[{ required: true, message: 'Elegí un perfil' }]}>
          <Radio.Group options={ROLE_OPTIONS} />
        </Form.Item>
        {isCreate && (
          <Form.Item
            label="Contraseña inicial"
            name="password"
            rules={[
              { required: true, message: 'Ingresá una contraseña' },
              {
                min: USER_PASSWORD_MIN_LENGTH,
                message: `La contraseña debe tener al menos ${USER_PASSWORD_MIN_LENGTH} caracteres`,
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

/** El margen sale del tema de antd (`margin`). */
const FormAlert = styled(Alert)<{ $margin: number }>`
  margin-bottom: ${(p) => p.$margin}px;
`;
