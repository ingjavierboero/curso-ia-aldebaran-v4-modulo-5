import { Card, Typography, theme } from 'antd';
import type { ReactNode } from 'react';
import styled from 'styled-components';

/** El padding sale del tema de antd (`paddingLG`). */
const Centered = styled.main<{ $padding: number }>`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${(p) => p.$padding}px;
`;

const Narrow = styled.div`
  width: 100%;
  max-width: 400px;
`;

/** Marco común de las pantallas sin sesión (login y registro del primer Admin). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Centered $padding={token.paddingLG}>
      <Narrow>
        <Card>
          <Typography.Title level={3}>{title}</Typography.Title>
          {children}
        </Card>
      </Narrow>
    </Centered>
  );
}
