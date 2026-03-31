import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function History() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/chat'); }, []);
  return null;
}
