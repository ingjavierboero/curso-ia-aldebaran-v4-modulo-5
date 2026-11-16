import { Alert, Button, Form, Input, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, useLoaderData, useNavigate, useParams } from 'react-router';
import { ApiError, INVALID_RESET_LINK_MESSAGE, confirmPasswordReset, errorText } from '../api/authApi';
import { CONFIRM_PASSWORD_RULES, NEW_PASSWORD_FIELD, NEW_PASSWORD_RULES } from '../api/passwordRules';
import { AuthCard } from '../components/AuthCard';
import { Stack } from '../components/Stack';
import { loginNoticeState } from '../routes/loginNotice';
import type { ResetTokenCheck } from '../routes/resetTokenCheck';

interface ResetPasswordValues {
  newPassword: string;
  confirmPassword: string;
}

const REDIRECT_DELAY_MS = 5000;
const SUCCESS_TEXT = 'Contraseña cambiada. Iniciá sesión con la nueva.';

/**
 * Cambio de contraseña con el enlace del email (FEAT-008, FR-04, FR-09 a FR-13), en `/recuperar/:token`.
 * El enlace ya lo validó el loader (una vez por navegación). Cada enlace monta su propia pantalla
 * (`key`): pasar de un enlace a otro no arrastra el token, el formulario ni la redirección del anterior.
 */
export function ResetPasswordPage() {
  const { token = '' } = useParams();
  return <ResetPasswordScreen key={token} token={token} />;
}

/**
 * Al montar, el token deja la barra de direcciones; la pantalla lo conserva en sus props para la
 * confirmación. Si el enlace no sirve (al entrar o al confirmar), muestra el motivo, le pasa el foco y
 * a los 5 s vuelve al login.
 */
function ResetPasswordScreen({ token }: { token: string }) {
  const check = useLoaderData<ResetTokenCheck>();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectedOnConfirm, setRejectedOnConfirm] = useState<string | null>(null);
  const deadEndRef = useRef<HTMLDivElement>(null);

  const deadEnd = check.status === 'valid' ? rejectedOnConfirm : check.message;

  // El token sale de la barra (y del historial) sin avisarle al router, que sigue en esta ruta.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', '/recuperar');
  }, []);

  useEffect(() => {
    if (deadEnd === null) return undefined;
    deadEndRef.current?.focus();
    const timer = setTimeout(() => {
      void navigate('/login', { replace: true });
    }, REDIRECT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [deadEnd, navigate]);

  async function onFinish(values: ResetPasswordValues) {
    setSubmitting(true);
    setError(null);
    try {
      await confirmPasswordReset(token, values.newPassword);
      const state = loginNoticeState({ type: 'success', text: SUCCESS_TEXT });
      await navigate('/login', { replace: true, state });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.message === INVALID_RESET_LINK_MESSAGE) {
        setRejectedOnConfirm(err.message);
        return;
      }
      // Otro 400 (contraseña rechazada), 429 o red: el motivo en pantalla y el formulario intacto.
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Definir una nueva contraseña">
      {deadEnd !== null ? (
        <Stack orientation="vertical" size="middle">
          <div ref={deadEndRef} tabIndex={-1}>
            <Alert type="error" title={deadEnd} showIcon />
          </div>
          <Typography.Paragraph type="secondary">En unos segundos te llevamos al inicio de sesión.</Typography.Paragraph>
          <Link to="/login" replace>
            Ir al inicio de sesión
          </Link>
        </Stack>
      ) : (
        <Stack orientation="vertical" size="middle">
          {error && <Alert type="error" title={error} showIcon />}
          <Form<ResetPasswordValues>
            name="reset-password"
            layout="vertical"
            onFinish={(values) => {
              void onFinish(values);
            }}
            disabled={submitting}
            requiredMark={false}
          >
            <Form.Item label="Contraseña nueva" name={NEW_PASSWORD_FIELD} rules={NEW_PASSWORD_RULES}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label="Repetir contraseña nueva"
              name="confirmPassword"
              dependencies={[NEW_PASSWORD_FIELD]}
              rules={CONFIRM_PASSWORD_RULES}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Cambiar contraseña
            </Button>
          </Form>
        </Stack>
      )}
    </AuthCard>
  );
}
