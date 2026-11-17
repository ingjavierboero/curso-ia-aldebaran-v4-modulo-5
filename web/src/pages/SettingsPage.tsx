import { Alert, Button, DatePicker, Form, Input, Select, Spin, Typography, theme } from 'antd';
import type { FormRule } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { ApiError, errorText } from '../api/authApi';
import { getBillingSettings, updateBillingSettings } from '../api/settingsApi';
import {
  ACTIVITY_START_MIN_DATE,
  IIBB_MAX_LENGTH,
  ISSUER_IVA_CONDITIONS,
  ISSUER_TEXT_MAX_LENGTH,
  POINT_OF_SALE_MAX,
  POINT_OF_SALE_MIN,
  buildSettingsChanges,
  canManageSettings,
  isValidActivityStartDate,
  isValidBillingHour,
  isValidPointOfSale,
  missingNotice,
  toSettingsDraft,
  type SettingsDraft,
} from '../api/settingsRules';
import type { BillingSettings } from '../api/types';
import { AppLayout } from '../components/AppLayout';
import { FormAlert, TitleRow } from '../components/PageParts';
import { useAuthStore } from '../store/authStore';
import { refreshSessionAfterForbidden } from '../store/refreshSession';

const IVA_OPTIONS = ISSUER_IVA_CONDITIONS.map((condition) => ({ label: condition.name, value: condition.code }));
/** Cómo se ve y se escribe la fecha en el `DatePicker`; el contrato usa `YYYY-MM-DD`. */
const DATE_INPUT_FORMAT = 'DD/MM/YYYY';
const API_DATE_FORMAT = 'YYYY-MM-DD';
const MIN_ACTIVITY_START = dayjs(ACTIVITY_START_MIN_DATE);

const HOUR_ERROR = 'Ingresá una hora entre 00:00 y 23:59, en formato HH:MM';
const POS_ERROR = `Ingresá un número entero entre ${POINT_OF_SALE_MIN} y ${POINT_OF_SALE_MAX}`;
const DATE_ERROR = 'Ingresá una fecha existente, desde el 01/01/1900 y no posterior a hoy';
const KEEP_SAVED_ERROR = 'Este dato ya está guardado: no se puede dejar vacío';

/**
 * Configuración de facturación (FEAT-011): hora de facturación, punto de venta y datos de la empresa
 * emisora. La ven los tres perfiles; solo el Admin la edita (para Editor y Consulta el formulario
 * queda deshabilitado y sin "Guardar", y el server igual rechaza el cambio).
 *
 * Los 6 datos obligatorios para facturar se marcan siempre (FR-10) y, mientras falte alguno, un aviso
 * los nombra según `missing` del server (FR-11). Se puede guardar con obligatorios vacíos (D-01). Al
 * guardar se envían solo los campos cambiados y la pantalla pasa a mostrar la configuración que
 * devolvió el server. Un 401 ya lleva al login (`client`); un 403 además refresca la sesión.
 */
export function SettingsPage() {
  const canManage = canManageSettings(useAuthStore((s) => s.user?.role));
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Cada guardado exitoso vuelve a montar el formulario con lo que devolvió el server.
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBillingSettings().then(
      (loaded) => {
        if (!cancelled) setSettings(loaded);
      },
      (err: unknown) => {
        if (cancelled || (err instanceof ApiError && err.status === 401)) return;
        setLoadError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const notice = settings === null ? null : missingNotice(settings.missing);

  return (
    <AppLayout>
      <TitleRow>
        <Typography.Title level={3}>Configuración</Typography.Title>
      </TitleRow>
      {loadError && <Alert type="error" title={loadError} showIcon />}
      {settings === null && loadError === null && <Spin />}
      {settings !== null && (
        <>
          {notice && <Alert type="warning" title={notice} showIcon />}
          {!canManage && <Alert type="info" title="Solo un Admin puede cambiar la configuración." showIcon />}
          {saved && <Alert type="success" title="Configuración guardada" showIcon />}
          <SettingsForm
            key={version}
            settings={settings}
            canManage={canManage}
            onSubmitting={() => {
              setSaved(false);
            }}
            onSaved={(updated) => {
              setSettings(updated);
              setVersion((v) => v + 1);
              setSaved(true);
            }}
          />
        </>
      )}
    </AppLayout>
  );
}

interface SettingsFormValues extends Omit<SettingsDraft, 'activityStartDate'> {
  activityStartDate: Dayjs | null;
}

function SettingsForm({
  settings,
  canManage,
  onSubmitting,
  onSaved,
}: {
  settings: BillingSettings;
  canManage: boolean;
  onSubmitting: () => void;
  onSaved: (updated: BillingSettings) => void;
}) {
  const [form] = Form.useForm<SettingsFormValues>();
  const { token } = theme.useToken();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const draft = toSettingsDraft(settings);
  const initialValues: SettingsFormValues = {
    ...draft,
    activityStartDate: draft.activityStartDate === '' ? null : dayjs(draft.activityStartDate),
  };
  const { issuer } = settings;

  async function onFinish(values: SettingsFormValues) {
    const changes = buildSettingsChanges(settings, {
      billingHour: values.billingHour,
      pointOfSale: values.pointOfSale,
      legalName: values.legalName,
      address: values.address,
      ivaCondition: values.ivaCondition,
      iibb: values.iibb,
      activityStartDate: values.activityStartDate?.format(API_DATE_FORMAT) ?? '',
      tradeName: values.tradeName,
    });
    onSubmitting();
    if (Object.keys(changes).length === 0) {
      setFeedback({ type: 'info', text: 'No hay cambios para guardar' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    let updated: BillingSettings;
    try {
      updated = await updateBillingSettings(changes);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 403) {
        // Sin permiso, lo escrito no se va a poder guardar: vuelven los valores guardados.
        form.resetFields();
        void refreshSessionAfterForbidden();
      }
      setFeedback({ type: 'error', text: errorText(err) });
      return;
    }
    onSaved(updated);
  }

  return (
    <NarrowColumn>
      {feedback && <FormAlert $margin={token.margin} type={feedback.type} title={feedback.text} showIcon />}
      <Form<SettingsFormValues>
        form={form}
        name="billing-settings"
        layout="vertical"
        initialValues={initialValues}
        disabled={!canManage || submitting}
        onFinish={(values) => {
          void onFinish(values);
        }}
      >
        <Typography.Title level={4}>Facturación</Typography.Title>
        <Form.Item
          label="Hora de facturación"
          name="billingHour"
          extra="Hora de Argentina en que corre la facturación del día 15 (HH:MM)."
          rules={[stringRule((value) => isValidBillingHour(value.trim()), HOUR_ERROR)]}
        >
          <Input autoComplete="off" placeholder="HH:MM" maxLength={5} />
        </Form.Item>
        <Form.Item
          label="Punto de venta"
          name="pointOfSale"
          required
          rules={[keepSavedRule(settings.pointOfSale !== null), optionalStringRule(isValidPointOfSale, POS_ERROR)]}
        >
          <Input autoComplete="off" inputMode="numeric" />
        </Form.Item>

        <Typography.Title level={4}>Empresa emisora</Typography.Title>
        <Form.Item
          label="Razón social"
          name="legalName"
          required
          rules={[keepSavedRule(issuer.legalName !== null), maxLengthRule(ISSUER_TEXT_MAX_LENGTH)]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Domicilio comercial"
          name="address"
          required
          rules={[keepSavedRule(issuer.address !== null), maxLengthRule(ISSUER_TEXT_MAX_LENGTH)]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Condición frente al IVA" name="ivaCondition" required>
          {/* Sin lista virtual: son 4 opciones. Sin "limpiar": un dato guardado no se vacía. */}
          <Select options={IVA_OPTIONS} virtual={false} placeholder="Elegí la condición frente al IVA" />
        </Form.Item>
        <Form.Item
          label="Número de ingresos brutos"
          name="iibb"
          required
          rules={[keepSavedRule(issuer.iibb !== null), maxLengthRule(IIBB_MAX_LENGTH)]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="Fecha de inicio de actividades"
          name="activityStartDate"
          required
          rules={[keepSavedRule(issuer.activityStartDate !== null), activityStartRule]}
        >
          <DatePicker
            format={DATE_INPUT_FORMAT}
            placeholder="DD/MM/AAAA"
            allowClear={false}
            // Tope con la fecha del navegador: solo de interfaz, el server aplica la de Argentina (W9).
            disabledDate={(date) => date.isAfter(dayjs(), 'day') || date.isBefore(MIN_ACTIVITY_START, 'day')}
          />
        </Form.Item>
        <Form.Item
          label="Nombre de fantasía"
          name="tradeName"
          rules={[keepSavedRule(issuer.tradeName !== null), maxLengthRule(ISSUER_TEXT_MAX_LENGTH)]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        {canManage && (
          <Button type="primary" htmlType="submit" loading={submitting}>
            Guardar
          </Button>
        )}
      </Form>
    </NarrowColumn>
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Un dato que ya tiene valor no se puede dejar vacío (fuera de alcance vaciarlo). */
function keepSavedRule(hasSavedValue: boolean): FormRule {
  return {
    validator(_rule, value: unknown) {
      if (hasSavedValue && isBlank(value)) return Promise.reject(new Error(KEEP_SAVED_ERROR));
      return Promise.resolve();
    },
  };
}

/** Valida un texto siempre (vacío incluido). */
function stringRule(isValid: (value: string) => boolean, message: string): FormRule {
  return {
    validator(_rule, value: unknown) {
      if (typeof value === 'string' && isValid(value)) return Promise.resolve();
      return Promise.reject(new Error(message));
    },
  };
}

/** Valida un texto solo si se escribió algo (el vacío lo resuelve `keepSavedRule`). */
function optionalStringRule(isValid: (value: string) => boolean, message: string): FormRule {
  return {
    validator(_rule, value: unknown) {
      if (isBlank(value) || (typeof value === 'string' && isValid(value))) return Promise.resolve();
      return Promise.reject(new Error(message));
    },
  };
}

/** Tope de largo contado después del trim, como el server. */
function maxLengthRule(max: number): FormRule {
  return optionalStringRule((value) => value.trim().length <= max, `Admite hasta ${max} caracteres`);
}

const activityStartRule: FormRule = {
  validator(_rule, value: unknown) {
    if (!dayjs.isDayjs(value)) return Promise.resolve();
    const today = dayjs().format(API_DATE_FORMAT);
    if (isValidActivityStartDate(value.format(API_DATE_FORMAT), today)) return Promise.resolve();
    return Promise.reject(new Error(DATE_ERROR));
  },
};

/** El formulario no ocupa todo el ancho: son campos cortos uno debajo del otro. */
const NarrowColumn = styled.div`
  max-width: 640px;
`;
