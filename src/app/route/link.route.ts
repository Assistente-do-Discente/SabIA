import { Router } from "express";
import {deleteShortLink, resolveShortLink} from "../service/shortlink.service";
import logger from "../config/logger.config";

export const linkRouter = Router();

linkRouter.get("/:id", async (req, res) => {
    logger.info(req.headers, 'headers: ');

    const id = req.params.id;
    const longUrl = await resolveShortLink(id);
    if (!longUrl) return res.status(404).send("Link expirado ou inválido");

    if (req.header('accept-language')) {
        await deleteShortLink(id)
    }

    res.redirect(longUrl);
});
