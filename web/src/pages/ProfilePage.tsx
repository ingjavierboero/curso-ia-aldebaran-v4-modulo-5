import { Alert, Button, Descriptions, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { changePassword, errorText } from '../api/authApi';
import { ROLE_LABELS, USER_PASSWORD_MAX_LENGTH, USER_PASSWORD_MIN_LENGTH } from '../api/userRules';
import { AppLayout } from '../components/AppLayout';
import { Stack } from '../components/Stack';
import { useAuthStore } from '../store/authStore';

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Lo que muestra el resultado del último envío: confirmación o el motivo del rechazo. */
interface Outcome {
  type: 'success' | 'error';
  text: string;
}

const SUCCESS_TEXT = 'La contraseña se cambió';

/**
 * "Mi perfil" (FEAT-007, FR-01/FR-02/FR-08/FR-10), para los tres perfiles: los datos del usuario en
 * solo lectura y el cambio de la propia contraseña. La guarda es el loader de `/perfil`; la regla real
 * (actual correcta, largo, distinta de la actual) la aplica el server, que devuelve el motivo en un 400.
 * Un 401 lo resuelve el cliente llevando al login.
 */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [form] = Form.useForm<PasswordFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function onFinish(values: PasswordFormValues) {
    setSubmitting(true);
    setOutcome(null);
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      form.resetFields();
      setOutcome({ type: 'success', text: SUCCESS_TEXT });
    } catch (err) {
      // `errorText`: el mensaje del server ante un `ApiError`, o "No se pudo conectar con el servidor".
      // El formulario conserva lo ingresado.
      setOutcome({ type: 'error', text: errorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <Typography.Title level={3}>Mi perfil</Typography.Title>
      <section aria-label="Datos del usuario">
        <Descriptions
          column={1}
          bordered
          items={[
            { key: 'name', label: 'Nombre', children: user?.name },
            { key: 'email', label: 'Email', children: user?.email },
            { key: 'role', label: 'Perfil', children: user ? ROLE_LABELS[user.role] : null },
          ]}
        />
      </section>
      <Typography.Title level={4}>Cambiar contraseña</Typography.Title>
      <Stack orientation="vertical" size="middle">
        {outcome && <Alert type={outcome.type} title={outcome.text} showIcon />}
        <Form<PasswordFormValues>
          form={form}
          name="change-password"
          layout="vertical"
          onFinish={(values) => {
            void onFinish(values);
          }}
          disabled={submitting}
          requiredMark={false}
        >
          <Form.Item
            label="Contraseña actual"
            name="currentPassword"
            rules={[{ required: true, message: 'Ingresá tu contraseña actual' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="Contraseña nueva"
            name="newPassword"
            rules={[
              { required: true, message: 'Ingresá la contraseña nueva' },
              {
                min: USER_PASSWORD_MIN_LENGTH,
                max: USER_PASSWORD_MAX_LENGTH,
                message: `La contraseña debe tener entre ${USER_PASSWORD_MIN_LENGTH} y ${USER_PASSWORD_MAX_LENGTH} caracteres`,
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Repetir contraseña nueva"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Repetí la contraseña nueva' },
              ({ getFieldValue }) => ({
                validator(_rule, value: unknown) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Las contraseñas no coinciden'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            Cambiar contraseña
          </Button>
        </Form>
      </Stack>
    </AppLayout>
  );
}
