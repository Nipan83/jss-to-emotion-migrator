import React from 'react';
import { styled } from '@mui/material/styles';

const Container = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  margin: theme.spacing(1),
  backgroundColor: theme.palette.background.paper,
}));

const Title = styled('h2')(({ theme }) => ({
  fontSize: 24,
  fontWeight: 'bold',
  color: theme.palette.text.primary,
}));

const Button = styled('button')(({ theme }) => ({
  marginTop: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
}));

function Card({ title, onAction }) {
  return (
    <Container>
      <Title>{title}</Title>
      <Button onClick={onAction}>
        Click Me
      </Button>
    </Container>
  );
}

export default Card;
