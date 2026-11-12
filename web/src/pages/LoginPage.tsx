import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, errorText, login, type LoginInput } from '../api/authApi';
import { AuthCard } from '../components/AuthCard';
import { Stack } from '../components/Stack';
import { readLoginNotice } from '../routes/loginNotice';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const [form] = Form.useForm<LoginInput>();
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notice = readLoginNotice(location.state);

  async function onFinish(values: LoginInput) {
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(values);
      setUser(user);
      // Se espera la navegación: si el loader de `/` devuelve a `/login` (la sesión no se pudo
      // confirmar), esta página sigue montada y el formulario tiene que volver a habilitarse.
      await navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err));
      // Tras credenciales rechazadas no queda la contraseña en el formulario (AC-03).
      if (err instanceof ApiError) form.setFieldValue('password', '');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Iniciar sesión en Aldebaran">
      <Stack orientation="vertical" size="middle">
        {notice && <Alert type={notice.type} title={notice.text} showIcon />}
        {error && <Alert type="error" title={error} showIcon />}
        <Form
          form={form}
          name="login"
          layout="vertical"
          onFinish={(values) => {
            void onFinish(values);
          }}
          disabled={submitting}
          requiredMark={false}
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Ingresá tu email' },
              { type: 'email', message: 'El email no tiene un formato válido' },
            ]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item label="Contraseña" name="password" rules={[{ required: true, message: 'Ingresá tu contraseña' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Ingresar
          </Button>
        </Form>
      </Stack>
    </AuthCard>
  );
}
