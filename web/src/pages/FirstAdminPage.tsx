import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, errorText, registerFirstAdmin, type FirstAdminInput } from '../api/authApi';
import { AuthCard } from '../components/AuthCard';
import { Stack } from '../components/Stack';
import { loginNoticeState } from '../routes/loginNotice';

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 100;

/** Registro del primer Admin (FR-05). Solo se llega con el sistema vacío; no inicia sesión. */
export function FirstAdminPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish(values: FirstAdminInput) {
    setSubmitting(true);
    setError(null);
    try {
      await registerFirstAdmin(values);
      const state = loginNoticeState({ type: 'success', text: 'Admin creado. Ya podés iniciar sesión.' });
      // Se espera la navegación: si un loader devolviera a `/setup`, esta página sigue montada y el
      // formulario tiene que volver a habilitarse (endurecimiento, mismo patrón que LoginPage).
      await navigate('/login', { replace: true, state });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Otro registro ganó (FR-06): ya hay usuarios, el lugar es el login.
        const state = loginNoticeState({ type: 'warning', text: err.message });
        await navigate('/login', { replace: true, state });
        return;
      }
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Registrar el primer Admin">
      <Stack orientation="vertical" size="middle">
        <Typography.Paragraph type="secondary">
          Todavía no hay usuarios. Creá el Admin que va a gestionar el sistema.
        </Typography.Paragraph>
        {error && <Alert type="error" title={error} showIcon />}
        <Form<FirstAdminInput>
          name="first-admin"
          layout="vertical"
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
              { max: NAME_MAX_LENGTH, message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` },
            ]}
          >
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Ingresá el email' },
              { type: 'email', message: 'El email no tiene un formato válido' },
            ]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="Contraseña"
            name="password"
            rules={[
              { required: true, message: 'Ingresá una contraseña' },
              { min: PASSWORD_MIN_LENGTH, message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Crear Admin
          </Button>
        </Form>
      </Stack>
    </AuthCard>
  );
}
