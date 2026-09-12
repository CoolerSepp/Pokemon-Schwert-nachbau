"""Prozedurale Koerperbauplaene fuer Kreaturenmodelle.

Konvention: Y = oben, +Z = Blickrichtung. Alle Masse in Metern.
Gliedmassen setzen ihren Drehpunkt an den Ansatz (`anchor` verschiebt das Mesh),
damit die Animation um Huefte/Schulter statt um die Teilmitte rotiert.
"""

def part(role, shape, pos, size, color, **kw):
    d = {"role": role, "shape": shape, "pos": [round(v, 4) for v in pos],
         "size": [round(v, 4) for v in size], "color": color}
    d.update(kw)
    return d


def _eyes(head_pos, head_size, forward, spread, up, r=0.085, eye="eye", pupil="pupil"):
    """Zwei Augen an der Kopfvorderseite, jeweils mit Pupille."""
    out = []
    hx, hy, hz = head_pos
    for sx in (-1, 1):
        ex = hx + sx * head_size[0] * spread
        ey = hy + head_size[1] * up
        ez = hz + head_size[2] * forward
        out.append(part("eye", "sphere", (ex, ey, ez), (r, r, r), eye, parent="head", detail=1))
        out.append(part("pupil", "sphere", (ex, ey, ez + r * 0.62), (r * 0.5, r * 0.55, r * 0.5),
                        pupil, parent="head", detail=1))
    return out


def quadruped(c):
    """Vierbeiner: Rumpf, vier Beine, Kopf mit Schnauze, Schweif."""
    bw, bh, bd = c["body"]
    leg_len = c["legLen"]
    leg_r = c.get("legR", bw * 0.22)
    by = leg_len + bh * 0.92
    parts = [
        part("body", c.get("bodyShape", "capsule"), (0, by, 0), (bw, bh, bd),
             "primary", flatShading=True, detail=c.get("detail", 2)),
    ]
    if c.get("chest"):
        parts.append(part("decor", "sphere", (0, by - bh * 0.2, bd * 0.5),
                          (bw * 0.8, bh * 0.75, bd * 0.5), "secondary", detail=2))
    hs = c["head"]
    hp = (0, by + bh * c.get("headUp", 0.55), bd * c.get("headFwd", 0.95))
    parts.append(part("head", c.get("headShape", "sphere"), hp, hs, "primary",
                      flatShading=True, detail=c.get("detail", 2)))
    if c.get("snout"):
        sw, sh, sd = c["snout"]
        parts.append(part("snout", "capsule", (hp[0], hp[1] - hs[1] * 0.28, hp[2] + hs[2] * 0.72),
                          (sw, sh, sd), "secondary", parent="head", detail=2))
    parts += _eyes(hp, hs, c.get("eyeFwd", 0.66), c.get("eyeSpread", 0.52),
                   c.get("eyeUp", 0.16), c.get("eyeR", hs[0] * 0.24))
    for sx in (-1, 1):
        if c.get("ears"):
            ew, eh, ed = c["ears"]
            parts.append(part("ear", c.get("earShape", "cone"),
                              (hp[0] + sx * hs[0] * 0.56, hp[1] + hs[1] * 0.72, hp[2] - hs[2] * 0.1),
                              (ew, eh, ed), c.get("earColor", "accent"), parent="head",
                              rot=[0, 0, -sx * 0.22], detail=1))
        if c.get("horns"):
            hw, hh, hd = c["horns"]
            parts.append(part("horn", "cone",
                              (hp[0] + sx * hs[0] * 0.42, hp[1] + hs[1] * 0.86, hp[2] + hs[2] * 0.1),
                              (hw, hh, hd), c.get("hornColor", "light"), parent="head",
                              rot=[-0.25, 0, -sx * 0.3], detail=1))
    for name, sx, sz in (("legFrontLeft", -1, 1), ("legFrontRight", 1, 1),
                         ("legBackLeft", -1, -1), ("legBackRight", 1, -1)):
        px = sx * bw * c.get("legSpread", 0.64)
        pz = sz * bd * c.get("legOffset", 0.58)
        parts.append(part(name, "capsule", (px, leg_len + bh * 0.15, pz),
                          (leg_r, leg_len * 0.5, leg_r), c.get("legColor", "dark"),
                          anchor=[0, -leg_len * 0.55, 0], detail=1))
        if c.get("paws"):
            parts.append(part("decor", "sphere", (px, leg_r * 0.75, pz),
                              (leg_r * 1.18, leg_r * 0.8, leg_r * 1.3), "accent", detail=1))
    if c.get("tail"):
        tw, th, td = c["tail"]
        parts.append(part("tail", c.get("tailShape", "capsule"),
                          (0, by + bh * 0.12, -bd * 0.95), (tw, th, td),
                          c.get("tailColor", "primary"), anchor=[0, 0, -td * 0.55],
                          rot=[c.get("tailPitch", -0.35), 0, 0], detail=2))
        if c.get("tailTip"):
            tt = c["tailTip"]
            parts.append(part("tailTip", c.get("tailTipShape", "sphere"),
                              (0, by + bh * 0.12 + td * 0.55, -bd * 0.95 - td * 0.9),
                              tt, c.get("tailTipColor", "accent"), parent="tail",
                              emissive=c.get("tailTipGlow", 0), detail=2))
    return parts


def biped(c):
    """Zweibeiner: aufrechter Rumpf, Arme, Beine, grosser Kopf."""
    bw, bh, bd = c["body"]
    leg_len = c["legLen"]
    by = leg_len + bh * 1.0
    parts = [part("body", c.get("bodyShape", "capsule"), (0, by, 0), (bw, bh, bd),
                  "primary", flatShading=True, detail=c.get("detail", 2))]
    if c.get("chest"):
        parts.append(part("decor", "sphere", (0, by - bh * 0.1, bd * 0.62),
                          (bw * 0.72, bh * 0.62, bd * 0.42), "secondary", detail=2))
    hs = c["head"]
    hp = (0, by + bh * 1.05 + hs[1] * 0.55, c.get("headFwd", 0.0))
    parts.append(part("head", c.get("headShape", "sphere"), hp, hs, "primary",
                      flatShading=True, detail=c.get("detail", 2)))
    if c.get("snout"):
        sw, sh, sd = c["snout"]
        parts.append(part("snout", "capsule", (0, hp[1] - hs[1] * 0.22, hp[2] + hs[2] * 0.78),
                          (sw, sh, sd), "secondary", parent="head", detail=2))
    parts += _eyes(hp, hs, c.get("eyeFwd", 0.7), c.get("eyeSpread", 0.48),
                   c.get("eyeUp", 0.14), c.get("eyeR", hs[0] * 0.26))
    for sx in (-1, 1):
        if c.get("ears"):
            ew, eh, ed = c["ears"]
            parts.append(part("ear", c.get("earShape", "cone"),
                              (sx * hs[0] * 0.6, hp[1] + hs[1] * 0.8, hp[2]),
                              (ew, eh, ed), c.get("earColor", "accent"), parent="head",
                              rot=[0, 0, -sx * 0.3], detail=1))
        if c.get("horns"):
            hw, hh, hd = c["horns"]
            parts.append(part("horn", "cone", (sx * hs[0] * 0.4, hp[1] + hs[1] * 0.9, hp[2] * 0.9),
                              (hw, hh, hd), c.get("hornColor", "light"), parent="head",
                              rot=[-0.2, 0, -sx * 0.34], detail=1))
    if c.get("crest"):
        cw, ch, cd = c["crest"]
        parts.append(part("crest", "cone", (0, hp[1] + hs[1] * 0.95, hp[2] - hs[2] * 0.15),
                          (cw, ch, cd), c.get("crestColor", "accent"), parent="head",
                          rot=[-0.4, 0, 0], detail=1))
    arm_len = c.get("armLen", bh * 0.9)
    arm_r = c.get("armR", bw * 0.2)
    for name, sx in (("armLeft", -1), ("armRight", 1)):
        parts.append(part(name, "capsule", (sx * bw * 0.95, by + bh * 0.42, 0),
                          (arm_r, arm_len * 0.5, arm_r), c.get("armColor", "primary"),
                          anchor=[0, -arm_len * 0.5, 0], rot=[0, 0, sx * 0.16], detail=1))
        if c.get("hands"):
            parts.append(part("decor", "sphere", (sx * bw * 0.95, by + bh * 0.42 - arm_len, 0),
                              (arm_r * 1.25,) * 3, c.get("handColor", "accent"), detail=1))
    leg_r = c.get("legR", bw * 0.26)
    for name, sx in (("legBackLeft", -1), ("legBackRight", 1)):
        parts.append(part(name, "capsule", (sx * bw * 0.46, leg_len + bh * 0.1, 0),
                          (leg_r, leg_len * 0.5, leg_r), c.get("legColor", "dark"),
                          anchor=[0, -leg_len * 0.55, 0], detail=1))
        parts.append(part("decor", "box", (sx * bw * 0.46, leg_r * 0.5, leg_r * 0.7),
                          (leg_r * 1.1, leg_r * 0.55, leg_r * 1.7), c.get("footColor", "accent"),
                          detail=1))
    if c.get("tail"):
        tw, th, td = c["tail"]
        parts.append(part("tail", "capsule", (0, by - bh * 0.5, -bd * 0.9), (tw, th, td),
                          c.get("tailColor", "primary"), anchor=[0, 0, -td * 0.55],
                          rot=[c.get("tailPitch", -0.5), 0, 0], detail=2))
        if c.get("tailTip"):
            parts.append(part("tailTip", c.get("tailTipShape", "sphere"),
                              (0, by - bh * 0.5 + td * 0.6, -bd * 0.9 - td * 0.95),
                              c["tailTip"], c.get("tailTipColor", "accent"), parent="tail",
                              emissive=c.get("tailTipGlow", 0), detail=2))
    return parts


def serpentine(c):
    """Schlangenartig: Segmentkette mit Kopf am vorderen Ende."""
    n = c.get("segments", 7)
    r0 = c["radius"]
    step = c.get("step", r0 * 1.35)
    y = c.get("baseY", r0 * 0.95)
    parts = []
    for i in range(n):
        t = i / max(1, n - 1)
        r = r0 * (1.0 - 0.55 * t ** 1.4)
        z = -i * step
        parts.append(part("body" if i == 0 else "tail", "sphere",
                          (0, y + c.get("wave", 0.0) * (1 if i % 2 else -1), z),
                          (r, r * 0.92, r * 1.05),
                          "primary" if i % 2 == 0 else "secondary",
                          flatShading=True, detail=2))
    hs = c["head"]
    hp = (0, y + c.get("headUp", r0 * 0.5), r0 * 1.5)
    parts.append(part("head", c.get("headShape", "sphere"), hp, hs, "primary",
                      flatShading=True, detail=2))
    if c.get("snout"):
        parts.append(part("snout", "cone", (0, hp[1] - hs[1] * 0.15, hp[2] + hs[2] * 0.85),
                          c["snout"], "secondary", parent="head", rot=[1.5708, 0, 0], detail=2))
    parts += _eyes(hp, hs, 0.6, 0.55, 0.18, hs[0] * 0.24)
    if c.get("hood"):
        hw, hh, hd = c["hood"]
        parts.append(part("crest", "cone", (0, hp[1] + hs[1] * 0.2, hp[2] - hs[2] * 0.9),
                          (hw, hh, hd), c.get("hoodColor", "accent"), parent="head",
                          rot=[-1.2, 0, 0], detail=1))
    if c.get("tailTip"):
        parts.append(part("tailTip", c.get("tailTipShape", "cone"),
                          (0, y, -(n - 1) * step - r0 * 0.6), c["tailTip"],
                          c.get("tailTipColor", "accent"),
                          rot=[-1.5708, 0, 0], emissive=c.get("tailTipGlow", 0), detail=2))
    return parts


def flyer(c):
    """Fliegende Form: kompakter Rumpf, grosse Fluegel, Schwanzfedern."""
    bw, bh, bd = c["body"]
    by = c.get("baseY", 0.8)
    parts = [part("body", c.get("bodyShape", "capsule"), (0, by, 0), (bw, bh, bd),
                  "primary", flatShading=True, detail=2)]
    hs = c["head"]
    hp = (0, by + bh * 0.85, bd * 0.55)
    parts.append(part("head", "sphere", hp, hs, "primary", flatShading=True, detail=2))
    if c.get("beak"):
        parts.append(part("snout", "cone", (0, hp[1] - hs[1] * 0.1, hp[2] + hs[2] * 0.9),
                          c["beak"], c.get("beakColor", "light"), parent="head",
                          rot=[1.5708, 0, 0], detail=1))
    parts += _eyes(hp, hs, 0.62, 0.55, 0.2, hs[0] * 0.24)
    if c.get("crest"):
        parts.append(part("crest", "cone", (0, hp[1] + hs[1] * 0.9, hp[2] - hs[2] * 0.2),
                          c["crest"], c.get("crestColor", "accent"), parent="head",
                          rot=[-0.5, 0, 0], detail=1))
    ww, wh, wd = c["wings"]
    for name, sx in (("wingLeft", -1), ("wingRight", 1)):
        parts.append(part(name, c.get("wingShape", "box"),
                          (sx * bw * 0.85, by + bh * 0.25, 0), (ww, wh, wd),
                          c.get("wingColor", "secondary"),
                          anchor=[sx * ww * 0.92, 0, 0], rot=[0, 0, sx * -0.18],
                          flatShading=True, detail=1))
    if c.get("tail"):
        parts.append(part("tail", "box", (0, by, -bd * 0.95), c["tail"],
                          c.get("tailColor", "secondary"), anchor=[0, 0, -c["tail"][2] * 0.9],
                          rot=[0.2, 0, 0], flatShading=True, detail=1))
    if c.get("legs", True):
        lr = c.get("legR", bw * 0.13)
        ll = c.get("legLen", bh * 0.55)
        for name, sx in (("legBackLeft", -1), ("legBackRight", 1)):
            parts.append(part(name, "capsule", (sx * bw * 0.38, by - bh * 0.75, 0),
                              (lr, ll * 0.5, lr), c.get("legColor", "light"),
                              anchor=[0, -ll * 0.5, 0], detail=1))
    return parts


def blob(c):
    """Rundliche Form: grosser Rumpf, kurze Fuesschen, ausdrucksstarke Augen."""
    r = c["radius"]
    by = c.get("baseY", r * 0.95)
    parts = [part("body", c.get("bodyShape", "sphere"), (0, by, 0),
                  (r, r * c.get("squash", 0.9), r), "primary", flatShading=True, detail=3)]
    hs = c.get("head")
    if hs:
        hp = (0, by + r * 0.85, 0)
    else:
        # Ohne eigenen Kopf: leicht ueberlappende Kuppel auf dem Rumpf - der
        # Animator braucht in jedem Rig ein "head"-Teil zum Nicken.
        hs = (r * 0.74, r * 0.7, r * 0.74)
        hp = (0, by + r * 0.42, r * 0.05)
    parts.append(part("head", "sphere", hp, hs, "primary", flatShading=True, detail=3))
    parts += _eyes(hp, hs, c.get("eyeFwd", 0.72), c.get("eyeSpread", 0.42),
                   c.get("eyeUp", 0.12), c.get("eyeR", r * 0.18))
    if c.get("mouth"):
        parts.append(part("snout", "sphere", (0, hp[1] - hs[1] * 0.3, hp[2] + hs[2] * 0.85),
                          c["mouth"], c.get("mouthColor", "dark"), parent="head", detail=1))
    for name, sx in (("legBackLeft", -1), ("legBackRight", 1)):
        fr = c.get("footR", r * 0.24)
        parts.append(part(name, "sphere", (sx * r * 0.5, fr * 0.85, r * 0.12),
                          (fr, fr * 0.75, fr * 1.2), c.get("legColor", "accent"),
                          anchor=[0, 0, 0], detail=1))
    for extra in c.get("blobs", []):
        parts.append(part("decor", "sphere", extra["pos"], extra["size"],
                          extra.get("color", "secondary"), detail=2,
                          emissive=extra.get("emissive", 0)))
    return parts


def floater(c):
    """Schwebende Form ohne Beine: Kernkoerper, Schleier, umkreisende Kugeln."""
    r = c["radius"]
    by = c.get("baseY", 1.25)
    parts = [part("body", c.get("bodyShape", "sphere"), (0, by, 0),
                  (r, r * c.get("squash", 1.0), r), "primary",
                  flatShading=True, detail=2, opacity=c.get("opacity", 1.0))]
    hs = c.get("head", (r * 0.78, r * 0.74, r * 0.78))
    hp = (0, by + r * c.get("headUp", 0.35), 0)
    parts.append(part("head", "sphere", hp, hs, "primary", flatShading=True, detail=2,
                      opacity=c.get("opacity", 1.0)))
    parts += _eyes(hp, hs, 0.7, 0.45, 0.1, c.get("eyeR", r * 0.17))
    if c.get("veil"):
        vw, vh, vd = c["veil"]
        parts.append(part("tail", "cone", (0, by - r * 0.7, 0), (vw, vh, vd),
                          c.get("veilColor", "secondary"), rot=[3.14159, 0, 0],
                          anchor=[0, -vh * 0.4, 0], opacity=c.get("veilOpacity", 0.85),
                          flatShading=True, detail=2))
    for i, orb in enumerate(c.get("orbs", [])):
        parts.append(part("orb", "sphere", orb["pos"], orb["size"],
                          orb.get("color", "glow"), emissive=orb.get("emissive", 0.8),
                          detail=2, parent=None if i else None))
    if c.get("arms"):
        aw, ah, ad = c["arms"]
        for name, sx in (("armLeft", -1), ("armRight", 1)):
            parts.append(part(name, "capsule", (sx * r * 0.95, by, 0), (aw, ah, ad),
                              c.get("armColor", "secondary"), anchor=[0, -ah * 0.5, 0],
                              rot=[0, 0, sx * 0.5], detail=1))
    return parts


def insectoid(c):
    """Insektenartig: Segmentkoerper, sechs Beine, Fuehler, optional Fluegel."""
    bw, bh, bd = c["body"]
    leg_len = c["legLen"]
    by = leg_len + bh * 0.85
    parts = [
        part("body", "capsule", (0, by, -bd * 0.15), (bw, bh, bd), "primary",
             flatShading=True, detail=2),
        part("shell", "sphere", (0, by + bh * 0.28, -bd * 0.35),
             (bw * 0.95, bh * 0.75, bd * 0.85), c.get("shellColor", "secondary"),
             flatShading=True, detail=2),
    ]
    hs = c["head"]
    hp = (0, by + bh * 0.2, bd * 0.95)
    parts.append(part("head", "sphere", hp, hs, "primary", flatShading=True, detail=2))
    parts += _eyes(hp, hs, 0.5, 0.62, 0.2, hs[0] * 0.3)
    if c.get("mandibles"):
        mw, mh, md = c["mandibles"]
        for sx in (-1, 1):
            parts.append(part("jaw", "cone", (sx * hs[0] * 0.45, hp[1] - hs[1] * 0.25,
                                              hp[2] + hs[2] * 0.7), (mw, mh, md),
                              c.get("mandibleColor", "dark"), parent="head",
                              rot=[1.3, 0, -sx * 0.4], detail=1))
    if c.get("antennae"):
        aw, ah, ad = c["antennae"]
        for sx in (-1, 1):
            parts.append(part("horn", "capsule", (sx * hs[0] * 0.45, hp[1] + hs[1] * 0.7,
                                                  hp[2] * 0.85), (aw, ah, ad),
                              c.get("antennaColor", "dark"), parent="head",
                              anchor=[0, ah * 0.5, 0], rot=[-0.5, 0, -sx * 0.5], detail=1))
    lr = c.get("legR", bw * 0.1)
    for i, zf in enumerate((0.75, 0.05, -0.65)):
        for sx in (-1, 1):
            name = ("legFrontLeft" if sx < 0 else "legFrontRight") if i == 0 else \
                   ("legBackLeft" if sx < 0 else "legBackRight")
            parts.append(part(name, "capsule", (sx * bw * 0.92, by - bh * 0.35, bd * zf),
                              (lr, leg_len * 0.5, lr), c.get("legColor", "dark"),
                              anchor=[0, -leg_len * 0.5, 0], rot=[0, 0, sx * 0.45], detail=1))
    if c.get("wings"):
        ww, wh, wd = c["wings"]
        for name, sx in (("wingLeft", -1), ("wingRight", 1)):
            parts.append(part(name, "plane", (sx * bw * 0.5, by + bh * 0.75, -bd * 0.2),
                              (ww, wh, wd), c.get("wingColor", "light"),
                              anchor=[sx * ww * 0.85, 0, 0], rot=[0.25, 0, sx * -0.25],
                              opacity=c.get("wingOpacity", 0.55), detail=1))
    if c.get("stinger"):
        parts.append(part("spike", "cone", (0, by, -bd * 1.15), c["stinger"],
                          c.get("stingerColor", "accent"), rot=[-1.5708, 0, 0], detail=1))
    return parts


def aquatic(c):
    """Wasserform: stromlinienfoermiger Koerper, Flossen, Schwanzflosse."""
    bw, bh, bd = c["body"]
    by = c.get("baseY", 0.75)
    parts = [part("body", "capsule", (0, by, 0), (bw, bh, bd), "primary",
                  flatShading=True, detail=3)]
    hs = c["head"]
    hp = (0, by + bh * 0.25, bd * 0.85)
    parts.append(part("head", "sphere", hp, hs, "primary", flatShading=True, detail=2))
    parts += _eyes(hp, hs, 0.55, 0.6, 0.18, hs[0] * 0.24)
    if c.get("snout"):
        parts.append(part("snout", "cone", (0, hp[1] - hs[1] * 0.2, hp[2] + hs[2] * 0.8),
                          c["snout"], "secondary", parent="head", rot=[1.5708, 0, 0], detail=2))
    if c.get("dorsal"):
        fw, fh, fd = c["dorsal"]
        parts.append(part("fin", "cone", (0, by + bh * 0.95, -bd * 0.1), (fw, fh, fd),
                          c.get("finColor", "accent"), rot=[-0.35, 0, 0],
                          flatShading=True, detail=1))
    sw, sh, sd = c.get("sideFins", (0.28, 0.08, 0.18))
    for name, sx in (("wingLeft", -1), ("wingRight", 1)):
        parts.append(part(name, "box", (sx * bw * 0.9, by - bh * 0.15, bd * 0.15),
                          (sw, sh, sd), c.get("finColor", "accent"),
                          anchor=[sx * sw * 0.85, 0, 0], rot=[0, 0, sx * -0.35],
                          flatShading=True, detail=1))
    tw, th, td = c.get("tailFin", (0.35, 0.42, 0.1))
    parts.append(part("tail", "cone", (0, by, -bd * 1.0), (tw, th, td),
                      c.get("finColor", "accent"), anchor=[0, 0, -td * 0.8],
                      rot=[-1.5708, 0, 0], flatShading=True, detail=1))
    return parts


BUILDERS = {
    "quadruped": quadruped, "biped": biped, "serpentine": serpentine,
    "flyer": flyer, "blob": blob, "floater": floater,
    "insectoid": insectoid, "aquatic": aquatic,
}


def build(rig, cfg):
    return BUILDERS[rig](cfg)
