import { Alert } from 'antd';
import styled from 'styled-components';

/** Título de una pantalla con su acción principal a la derecha ("Nuevo …"). */
export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

/** Error dentro de un formulario modal; el margen sale del tema de antd (`margin`). */
export const FormAlert = styled(Alert)<{ $margin: number }>`
  margin-bottom: ${(p) => p.$margin}px;
`;
