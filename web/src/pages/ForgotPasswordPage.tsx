import { Alert, Button, Form, Input, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorText, requestPasswordReset } from '../api/authApi';
import { USER_EMAIL_MAX_LENGTH } from '../api/userRules';
import { AuthCard } from '../components/AuthCard';
import { Stack } from '../components/Stack';

interface ForgotPasswordValues {
  email: string;
}

/**
 * "Olvidé mi contraseña" (FEAT-008, FR-01): pide el enlace de recuperación. El server responde siempre
 * el mismo mensaje, exista o no el email, y la pantalla muestra ese texto tal cual. Un 429 o un error
 * de red se muestran en pantalla y el formulario conserva el email.
 */
export function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  // El formulario (con el foco) desaparece al enviar: el foco pasa al mensaje para no perderse.
  useEffect(() => {
    if (sentMessage !== null) sentRef.current?.focus();
  }, [sentMessage]);

  async function onFinish(values: ForgotPasswordValues) {
    setSubmitting(true);
    setError(null);
    try {
      const { message } = await requestPasswordReset(values.email);
      setSentMessage(message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Recuperar la contraseña">
      <Stack orientation="vertical" size="middle">
        {sentMessage ? (
          <div ref={sentRef} tabIndex={-1}>
            <Alert type="success" title={sentMessage} showIcon />
          </div>
        ) : (
          <>
            <Typography.Paragraph type="secondary">
              Ingresá tu email y te enviamos un enlace para definir una nueva contraseña.
            </Typography.Paragraph>
            {error && <Alert type="error" title={error} showIcon />}
            <Form<ForgotPasswordValues>
              name="forgot-password"
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
                  { max: USER_EMAIL_MAX_LENGTH, message: `El email admite hasta ${USER_EMAIL_MAX_LENGTH} caracteres` },
                ]}
              >
                <Input autoComplete="username" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Enviar enlace
              </Button>
            </Form>
          </>
        )}
        <Link to="/login">Volver al inicio de sesión</Link>
      </Stack>
    </AuthCard>
  );
}
