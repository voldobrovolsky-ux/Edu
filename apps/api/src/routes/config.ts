import { Router } from "express";
import { officeConfig } from "../config/office.js";

export const configRouter = Router();

configRouter.get("/office", (_req, res) => {
  // Структура кабинетов (GENERAL DESCRIPTION §2.2)
  res.json({ office: officeConfig });
});

