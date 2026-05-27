import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';

const authService = new AuthService();

export const login: RequestHandler = async (req, res) => {
  const { nombreUsuario, contrasena } = req.body as { nombreUsuario: string; contrasena: string };

  try {
    const token = await authService.login(nombreUsuario, contrasena);

    if (!token) {
      res.status(401).json({ success: false, error: { message: 'Invalid credentials or inactive user' } });
      return;
    }

    res.json({ success: true, data: { token } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
