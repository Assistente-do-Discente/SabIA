import { Router } from "express";
import { resolveShortLink } from "../service/shortlink.service";

export const linkRouter = Router();

linkRouter.get("/:id", async (req, res) => {
    console.log('ShortLink Log Headers: ', req.headers);
    const id = req.params.id;
    const longUrl = await resolveShortLink(id);
    if (!longUrl) return res.status(404).send("Link expirado ou inválido");

    res.redirect(longUrl);
});
