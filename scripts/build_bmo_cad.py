#!/usr/bin/env python3
"""
BMO Quota Pet CAD Model Generator for FreeCAD (v2 - Sitting Pose & Authentic Details)
Matches user's reference 3D-printed BMO:
- Sitting pose: body flat on desk, cute legs sticking forward with feet pointing up,
  arms running down sides with hands resting flat on the desk surface.
- Authentic front controls:
  * Stepped beveled screen bezel for 0.96" OLED
  * Horizontal disk drive slot + small circular button beside it
  * Yellow D-pad (+) on left
  * Teal triangle button in center
  * Chunky red circular button on lower right + small circular accent above it
  * Dual horizontal vent dashes between legs
  * Side embossed "BMO" lettering
- Accurate internal packaging (OLED, ESP32-CAM, 503040 LiPo, TP4056 USB-C, 2 tactile switches)
- Collision check & high-res image exports
"""

import sys
import math
import os
import FreeCAD as App
import FreeCADGui as Gui
import Part
from FreeCAD import Vector, Rotation, Placement

def build_bmo_cad():
    doc_name = "BMO_QUOTA_PET"
    if doc_name in App.listDocuments():
        App.closeDocument(doc_name)

    doc = App.newDocument(doc_name)
    print(f"=== Initialized Document: {doc_name} (Sitting BMO Version) ===")

    # Groups for tree organization
    grp_electronics = doc.addObject("App::DocumentObjectGroup", "Electronics_Components")
    grp_enclosure = doc.addObject("App::DocumentObjectGroup", "BMO_Enclosure")
    grp_controls = doc.addObject("App::DocumentObjectGroup", "BMO_Front_Controls")
    grp_limbs = doc.addObject("App::DocumentObjectGroup", "BMO_Limbs_Sitting")
    grp_inspection = doc.addObject("App::DocumentObjectGroup", "Inspection_Views")

    # =========================================================================
    # 1. PARAMETRIC ENVELOPE DIMENSIONS (in mm)
    # =========================================================================
    # Body rests on table at Z = 0.0
    CAV_W = 39.0   # X: -19.5 to +19.5
    CAV_D = 24.5   # Y: -12.25 to +12.25
    CAV_H = 60.0   # Z: 2.5 to 62.5

    # Walls
    WALL_FRONT = 2.75
    WALL_BACK = 2.75
    WALL_SIDE = 2.50
    WALL_TOP = 2.50
    WALL_BOTTOM = 2.50

    # Outer Shell: X in [-22, 22], Y in [-15, 15], Z in [0, 65]
    SHELL_W = CAV_W + 2 * WALL_SIDE          # 44.0 mm
    SHELL_D = CAV_D + WALL_FRONT + WALL_BACK # 30.0 mm
    SHELL_H = CAV_H + WALL_TOP + WALL_BOTTOM # 65.0 mm
    CORNER_R = 4.0

    print(f"Enclosure Specifications:")
    print(f"  Internal Cavity: {CAV_W:.1f}W x {CAV_D:.1f}D x {CAV_H:.1f}H mm")
    print(f"  External Shell:  {SHELL_W:.1f}W x {SHELL_D:.1f}D x {SHELL_H:.1f}H mm")
    print(f"  Pose: Sitting on flat base (Z=0)")

    def make_rounded_box(w, d, h, r, base_pnt):
        """Constructs a rounded box with filleted vertical corners."""
        bx, by, bz = base_pnt.x, base_pnt.y, base_pnt.z
        dx = w - 2*r
        dy = d - 2*r
        b1 = Part.makeBox(dx, d, h, Vector(bx + r, by, bz))
        b2 = Part.makeBox(w, dy, h, Vector(bx, by + r, bz))
        c1 = Part.makeCylinder(r, h, Vector(bx + r, by + r, bz))
        c2 = Part.makeCylinder(r, h, Vector(bx + w - r, by + r, bz))
        c3 = Part.makeCylinder(r, h, Vector(bx + w - r, by + d - r, bz))
        c4 = Part.makeCylinder(r, h, Vector(bx + r, by + d - r, bz))
        return b1.fuse(b2).fuse(c1).fuse(c2).fuse(c3).fuse(c4)

    def make_rounded_plate_xz(w, d, h, r, base_pnt):
        """Constructs a plate with rounded corners in the X-Z (front-facing) plane."""
        bx, by, bz = base_pnt.x, base_pnt.y, base_pnt.z
        dx = w - 2*r
        dz = h - 2*r
        b1 = Part.makeBox(dx, d, h, Vector(bx + r, by, bz))
        b2 = Part.makeBox(w, d, dz, Vector(bx, by, bz + r))
        c1 = Part.makeCylinder(r, d, Vector(bx + r, by, bz + r), Vector(0, 1, 0))
        c2 = Part.makeCylinder(r, d, Vector(bx + w - r, by, bz + r), Vector(0, 1, 0))
        c3 = Part.makeCylinder(r, d, Vector(bx + w - r, by, bz + h - r), Vector(0, 1, 0))
        c4 = Part.makeCylinder(r, d, Vector(bx + r, by, bz + h - r), Vector(0, 1, 0))
        return b1.fuse(b2).fuse(c1).fuse(c2).fuse(c3).fuse(c4)

    # =========================================================================
    # 2. ELECTRONICS COMPONENTS (Accurate Mock Models)
    # =========================================================================

    # --- A. OLED 0.96 inch I2C Display Module (SSD1306) ---
    oled_pcb_w = 27.0
    oled_pcb_h = 27.0
    oled_pcb_th = 1.6
    oled_z_pos = 33.5
    oled_y_pos = -10.6

    pcb_box = Part.makeBox(oled_pcb_w, oled_pcb_th, oled_pcb_h,
                           Vector(-oled_pcb_w/2, oled_y_pos, oled_z_pos))
    hole_r = 1.0
    h1 = Part.makeCylinder(hole_r, 3.0, Vector(-11.5, oled_y_pos - 0.5, oled_z_pos + 2.0), Vector(0,1,0))
    h2 = Part.makeCylinder(hole_r, 3.0, Vector(11.5, oled_y_pos - 0.5, oled_z_pos + 2.0), Vector(0,1,0))
    h3 = Part.makeCylinder(hole_r, 3.0, Vector(-11.5, oled_y_pos - 0.5, oled_z_pos + 25.0), Vector(0,1,0))
    h4 = Part.makeCylinder(hole_r, 3.0, Vector(11.5, oled_y_pos - 0.5, oled_z_pos + 25.0), Vector(0,1,0))
    oled_pcb_shape = pcb_box.cut(h1).cut(h2).cut(h3).cut(h4)

    # Glass display panel
    glass_w = 24.0
    glass_h = 14.5
    glass_th = 1.3
    glass_z = 39.5
    glass_y = -11.9
    oled_glass_shape = Part.makeBox(glass_w, glass_th, glass_h,
                                     Vector(-glass_w/2, glass_y, glass_z))

    # Active visual face (128x64 display area)
    disp_w = 21.74
    disp_h = 10.86
    disp_shape = Part.makeBox(disp_w, 0.1, disp_h,
                              Vector(-disp_w/2, glass_y - 0.05, glass_z + 1.82))

    # 4-pin header at top of PCB
    hdr_box = Part.makeBox(10.16, 2.54, 2.5, Vector(-5.08, -9.0, oled_z_pos + 24.5))
    for i in range(4):
        pin_x = -3.81 + i * 2.54
        pin = Part.makeBox(0.64, 4.0, 0.64, Vector(pin_x - 0.32, -9.0, oled_z_pos + 25.75 - 0.32))
        hdr_box = hdr_box.fuse(pin)

    obj_oled_pcb = doc.addObject("Part::Feature", "OLED_096_PCB")
    obj_oled_pcb.Shape = oled_pcb_shape
    obj_oled_glass = doc.addObject("Part::Feature", "OLED_096_Glass")
    obj_oled_glass.Shape = oled_glass_shape
    obj_oled_disp = doc.addObject("Part::Feature", "OLED_096_ActiveArea")
    obj_oled_disp.Shape = disp_shape
    obj_oled_hdr = doc.addObject("Part::Feature", "OLED_096_Header")
    obj_oled_hdr.Shape = hdr_box

    # --- B. Tactile Switches & Retained Button Caps (Production Ready) ---
    btn_w = 6.0
    btn_d = 3.5
    btn_h = 6.0
    btn_y = -10.5

    # Switch A (behind Yellow D-Pad)
    btn_a_x = -10.5
    btn_a_z = 20.0
    # Switch B (behind Red Action Button)
    btn_b_x = 9.5
    btn_b_z = 13.5

    def make_tactile_switch(cx, cy, cz):
        body = Part.makeBox(btn_w, btn_d, btn_h, Vector(cx - btn_w/2, cy, cz - btn_h/2))
        stem = Part.makeCylinder(1.7, 3.5, Vector(cx, cy, cz), Vector(0, -1, 0))
        # Direct soldered wires coming off terminals
        w1 = Part.makeCylinder(0.5, 8.0, Vector(cx - 2.5, cy + 2.0, cz - 3.0), Vector(0, 0, -1))
        w2 = Part.makeCylinder(0.5, 8.0, Vector(cx + 2.5, cy + 2.0, cz - 3.0), Vector(0, 0, -1))
        return body.fuse(stem).fuse(w1).fuse(w2)

    obj_btn_sw_a = doc.addObject("Part::Feature", "Tactile_Switch_A_DPad")
    obj_btn_sw_a.Shape = make_tactile_switch(btn_a_x, btn_y, btn_a_z)
    obj_btn_sw_b = doc.addObject("Part::Feature", "Tactile_Switch_B_Red")
    obj_btn_sw_b.Shape = make_tactile_switch(btn_b_x, btn_y, btn_b_z)

    # --- C. LiPo Battery 503040 (3.7V 600mAh) ---
    bat_w = 30.0
    bat_d = 5.2
    bat_h = 42.0
    bat_x = -bat_w/2
    bat_y = -6.2 # Safe clearance from buttons (-7.0) and ESP32 (+1.3)
    bat_z = 8.5

    bat_core = Part.makeBox(bat_w - 2, bat_d, bat_h - 2, Vector(bat_x + 1, bat_y, bat_z + 1))
    c1 = Part.makeCylinder(1.0, bat_d, Vector(bat_x + 1, bat_y, bat_z + 1), Vector(0,1,0))
    c2 = Part.makeCylinder(1.0, bat_d, Vector(bat_x + bat_w - 1, bat_y, bat_z + 1), Vector(0,1,0))
    c3 = Part.makeCylinder(1.0, bat_d, Vector(bat_x + 1, bat_y, bat_z + bat_h - 1), Vector(0,1,0))
    c4 = Part.makeCylinder(1.0, bat_d, Vector(bat_x + bat_w - 1, bat_y, bat_z + bat_h - 1), Vector(0,1,0))
    bat_shape = bat_core.fuse(c1).fuse(c2).fuse(c3).fuse(c4)

    bat_pcb = Part.makeBox(28.0, 4.0, 2.5, Vector(-14.0, bat_y + 0.6, bat_z + bat_h - 1.0))
    lead_pos = Part.makeCylinder(0.6, 6.0, Vector(-4.0, bat_y + 2.0, bat_z + bat_h + 1.5), Vector(0,0,1))
    lead_neg = Part.makeCylinder(0.6, 6.0, Vector(4.0, bat_y + 2.0, bat_z + bat_h + 1.5), Vector(0,0,1))
    bat_shape = bat_shape.fuse(bat_pcb).fuse(lead_pos).fuse(lead_neg)

    obj_bat = doc.addObject("Part::Feature", "LiPo_Battery_503040")
    obj_bat.Shape = bat_shape

    # --- D. ESP32-CAM AI-Thinker Module ---
    esp_w = 27.0
    esp_h = 40.5
    esp_th = 1.2
    esp_x = -esp_w/2
    esp_y = 4.5
    esp_z = 20.0

    esp_pcb = Part.makeBox(esp_w, esp_th, esp_h, Vector(esp_x, esp_y, esp_z))
    shield = Part.makeBox(15.5, 2.4, 12.0, Vector(-7.75, esp_y - 2.4, esp_z + 24.0))
    cam_base = Part.makeBox(8.5, 3.2, 8.5, Vector(-4.25, esp_y - 3.2, esp_z + 11.5))
    cam_lens = Part.makeCylinder(2.5, 1.8, Vector(0, esp_y - 3.2, esp_z + 15.75), Vector(0, -1, 0))
    # Low-profile direct-solder wire pads (Shop soldered, no bulky pin headers)
    solder_l = Part.makeBox(1.5, 1.2, 20.32, Vector(esp_x, esp_y + esp_th, esp_z + 5.0))
    solder_r = Part.makeBox(1.5, 1.2, 20.32, Vector(esp_x + esp_w - 1.5, esp_y + esp_th, esp_z + 5.0))
    sd_slot = Part.makeBox(14.5, 1.6, 15.0, Vector(-7.25, esp_y + esp_th, esp_z + 4.0))

    esp_shape = esp_pcb.fuse(shield).fuse(cam_base).fuse(cam_lens).fuse(solder_l).fuse(solder_r).fuse(sd_slot)
    obj_esp = doc.addObject("Part::Feature", "ESP32_CAM_AI_Thinker")
    obj_esp.Shape = esp_shape

    # --- E. Power & Charger Board (TP4056 / Boost ~15x40 mm) ---
    pwr_w = 36.0
    pwr_h = 14.5
    pwr_th = 1.6
    pwr_x = -pwr_w/2
    pwr_y = 4.5
    pwr_z = 3.5

    pwr_pcb = Part.makeBox(pwr_w, pwr_th, pwr_h, Vector(pwr_x, pwr_y, pwr_z))
    usbc = Part.makeBox(9.0, 7.5, 3.2, Vector(-4.5, pwr_y + pwr_th, pwr_z + 3.0))
    ind = Part.makeBox(6.5, 3.0, 6.5, Vector(-14.0, pwr_y - 3.0, pwr_z + 4.0))
    ic = Part.makeBox(4.0, 1.2, 4.0, Vector(8.0, pwr_y - 1.2, pwr_z + 5.0))
    pwr_shape = pwr_pcb.fuse(usbc).fuse(ind).fuse(ic)

    obj_pwr = doc.addObject("Part::Feature", "Power_Charger_Module")
    obj_pwr.Shape = pwr_shape

    for o in [obj_oled_pcb, obj_oled_glass, obj_oled_disp, obj_oled_hdr,
              obj_btn_sw_a, obj_btn_sw_b, obj_bat, obj_esp, obj_pwr]:
        grp_electronics.addObject(o)

    # =========================================================================
    # 3. BMO ENCLOSURE SHELL WITH STEPPED BEZEL & CUTOUTS
    # =========================================================================

    # Outer solid: [-22, 22] x [-15, 15] x [0, 65]
    outer_solid = make_rounded_box(SHELL_W, SHELL_D, SHELL_H, CORNER_R,
                                   Vector(-SHELL_W/2, -15.0, 0.0))

    # Cavity solid: [-19.5, 19.5] x [-12.25, 12.25] x [2.5, 62.5]
    cavity_solid = make_rounded_box(CAV_W, CAV_D, CAV_H, 2.0,
                                    Vector(-CAV_W/2, -12.25, 2.5))

    enclosure_hollow = outer_solid.cut(cavity_solid)

    # --- Screen Bezel: Stepped Recess like the reference image ---
    # Outer beveled recess around screen (depth 1.0 mm)
    bezel_outer = make_rounded_plate_xz(29.0, 3.0, 19.5, 2.5, Vector(-14.5, -16.0, 37.0))
    # Inner through-cutout for OLED viewing (24 x 14.5 mm)
    bezel_inner = Part.makeBox(24.2, 6.0, 14.5, Vector(-12.1, -16.0, 39.5))

    # --- Disk Drive Slot Cutout ---
    # Horizontal slot under screen: width 15 mm, height 1.8 mm, depth 1.5 mm
    disk_slot_cut = Part.makeBox(15.0, 3.0, 1.8, Vector(-13.0, -16.0, 32.5))

    # --- Button Cutout Holes ---
    # Hole for D-Pad cross (loose clearance for cross plunger)
    dpad_hole_v = Part.makeBox(4.2, 4.0, 11.8, Vector(-2.1, -16.0, -5.9))
    dpad_hole_h = Part.makeBox(11.8, 4.0, 4.2, Vector(-5.9, -16.0, -2.1))
    dpad_hole = dpad_hole_v.fuse(dpad_hole_h)
    dpad_hole.translate(Vector(btn_a_x, 0, btn_a_z))

    # Hole for Red Action Button (Dia 7.4 mm)
    red_btn_hole = Part.makeCylinder(3.7, 4.0, Vector(btn_b_x, -16.0, btn_b_z), Vector(0,1,0))

    # Holes for Sitting Legs at bottom front
    leg_cut_l = Part.makeCylinder(3.0, 4.0, Vector(-8.0, -16.0, 5.0), Vector(0,1,0))
    leg_cut_r = Part.makeCylinder(3.0, 4.0, Vector(8.0, -16.0, 5.0), Vector(0,1,0))

    # Dual bottom vent dash cuts between legs
    dash1 = Part.makeBox(3.0, 2.0, 1.2, Vector(-4.2, -15.5, 5.5))
    dash2 = Part.makeBox(3.0, 2.0, 1.2, Vector(1.2, -15.5, 5.5))

    front_shell_carved = (enclosure_hollow
                          .cut(bezel_outer)
                          .cut(bezel_inner)
                          .cut(disk_slot_cut)
                          .cut(dpad_hole)
                          .cut(red_btn_hole)
                          .cut(leg_cut_l)
                          .cut(leg_cut_r)
                          .cut(dash1)
                          .cut(dash2))

    # Split Front Shell (Y <= +12.0) and Back Lid (Y > +12.0)
    split_plane_y = 12.0
    back_cut_box = Part.makeBox(SHELL_W + 10, 10.0, SHELL_H + 10,
                                Vector(-SHELL_W/2 - 5, split_plane_y, -5.0))

    front_shell_final = front_shell_carved.cut(back_cut_box)

    # Internal Ribs: OLED shelf & battery cradle
    oled_ledge = Part.makeBox(28.0, 2.5, 1.5, Vector(-14.0, -11.5, 32.0))
    bat_cradle = Part.makeBox(31.0, 5.6, 1.2, Vector(-15.5, -6.4, 7.3))
    boss1 = Part.makeCylinder(2.2, 60.0, Vector(-17.0, -10.0, 2.5)).cut(Part.makeCylinder(0.9, 60.0, Vector(-17.0, -10.0, 2.5)))
    boss2 = Part.makeCylinder(2.2, 60.0, Vector(17.0, -10.0, 2.5)).cut(Part.makeCylinder(0.9, 60.0, Vector(17.0, -10.0, 2.5)))
    front_shell_final = front_shell_final.fuse(oled_ledge).fuse(bat_cradle).fuse(boss1).fuse(boss2)

    obj_front_shell = doc.addObject("Part::Feature", "BMO_Front_Shell")
    obj_front_shell.Shape = front_shell_final

    # --- Back Lid (Nắp lưng) ---
    back_plate_solid = outer_solid.common(back_cut_box)
    back_inner_relief = Part.makeBox(CAV_W - 1.0, 2.5, CAV_H - 1.0,
                                     Vector(-(CAV_W-1.0)/2, split_plane_y, 3.0))
    back_lid = back_plate_solid.cut(back_inner_relief)

    usbc_cut = Part.makeBox(10.0, 5.0, 4.0, Vector(-5.0, 11.5, 6.0))
    switch_cut = Part.makeBox(8.5, 5.0, 4.0, Vector(9.0, 11.5, 6.0))
    g1 = Part.makeBox(14.0, 5.0, 1.5, Vector(-7.0, 11.5, 44.0))
    g2 = Part.makeBox(14.0, 5.0, 1.5, Vector(-7.0, 11.5, 47.5))
    g3 = Part.makeBox(14.0, 5.0, 1.5, Vector(-7.0, 11.5, 51.0))
    back_lid_final = back_lid.cut(usbc_cut).cut(switch_cut).cut(g1).cut(g2).cut(g3)

    obj_back_lid = doc.addObject("Part::Feature", "BMO_Back_Cover")
    obj_back_lid.Shape = back_lid_final

    grp_enclosure.addObject(obj_front_shell)
    grp_enclosure.addObject(obj_back_lid)

    # =========================================================================
    # 4. AUTHENTIC FRONT CONTROLS (Matching Reference Image)
    # =========================================================================

    # --- 1. Yellow D-Pad Cross Button (with Internal Retention Flange) ---
    dpad_v = Part.makeBox(3.4, 3.2, 11.0, Vector(-1.7, -16.5, -5.5))
    dpad_h = Part.makeBox(11.0, 3.2, 3.4, Vector(-5.5, -16.5, -1.7))
    dpad_cross = dpad_v.fuse(dpad_h)
    dpad_cross.translate(Vector(btn_a_x, 0, btn_a_z))
    # Internal flange keeps D-pad from falling out through front hole
    dpad_flange = Part.makeBox(13.0, 0.8, 13.0, Vector(btn_a_x - 6.5, -13.0, btn_a_z - 6.5))
    dpad_shape = dpad_cross.fuse(dpad_flange)
    obj_ctrl_dpad = doc.addObject("Part::Feature", "BMO_DPad_Yellow")
    obj_ctrl_dpad.Shape = dpad_shape

    # --- 2. Teal Triangle Accent Button (Center) ---
    # Triangle pointing UP: base 7.0 mm, height 7.0 mm, thickness 2.0 mm
    p1 = Vector(-3.5, -16.0, 16.5)
    p2 = Vector(3.5, -16.0, 16.5)
    p3 = Vector(0.0, -16.0, 23.5)
    tri_wire = Part.makePolygon([p1, p2, p3, p1])
    tri_face = Part.Face(tri_wire)
    tri_prism = tri_face.extrude(Vector(0, 1.8, 0))
    obj_ctrl_tri = doc.addObject("Part::Feature", "BMO_Triangle_Button")
    obj_ctrl_tri.Shape = tri_prism

    # --- 3. Chunky Red Round Action Button (with Internal Retention Flange) ---
    red_stem = Part.makeCylinder(3.4, 4.0, Vector(btn_b_x, -13.0, btn_b_z), Vector(0, -1, 0))
    red_flange = Part.makeCylinder(4.5, 0.8, Vector(btn_b_x, -13.0, btn_b_z), Vector(0, 1, 0))
    red_cap = red_stem.fuse(red_flange)
    obj_ctrl_red = doc.addObject("Part::Feature", "BMO_Action_Button_Red")
    obj_ctrl_red.Shape = red_cap

    # --- 4. Small Teal Upper Button (Beside Disk Slot) ---
    small_btn_upper = Part.makeCylinder(1.5, 1.8, Vector(8.5, -16.0, 33.4), Vector(0, 1, 0))
    obj_ctrl_small_up = doc.addObject("Part::Feature", "BMO_Small_Button_Upper")
    obj_ctrl_small_up.Shape = small_btn_upper

    # --- 5. Small Teal Accent Button (Above Red Button) ---
    small_btn_mid = Part.makeCylinder(1.3, 1.8, Vector(11.2, -16.0, 22.0), Vector(0, 1, 0))
    obj_ctrl_small_mid = doc.addObject("Part::Feature", "BMO_Small_Button_Mid")
    obj_ctrl_small_mid.Shape = small_btn_mid

    # --- 6. Disk Drive Bar (Raised frame under screen) ---
    bar_outer = Part.makeBox(16.0, 1.0, 2.6, Vector(-13.5, -15.8, 32.1))
    bar_slot = Part.makeBox(13.0, 2.0, 1.2, Vector(-12.0, -16.2, 32.8))
    disk_bar = bar_outer.cut(bar_slot)
    obj_ctrl_disk = doc.addObject("Part::Feature", "BMO_Disk_Drive_Bar")
    obj_ctrl_disk.Shape = disk_bar

    for o in [obj_ctrl_dpad, obj_ctrl_tri, obj_ctrl_red,
              obj_ctrl_small_up, obj_ctrl_small_mid, obj_ctrl_disk]:
        grp_controls.addObject(o)

    # =========================================================================
    # 5. SITTING LIMBS (Cute Sitting Legs & Resting Arms)
    # =========================================================================

    # --- Sitting Legs (L-shaped cute legs pointing forward & up) ---
    # Legs come out of front face at Z = 5.0 mm, extend forward along -Y,
    # then turn 90° UP into cute feet!
    def make_sitting_leg(cx):
        # Thigh: horizontal forward cylinder
        thigh_r = 2.4
        thigh_len = 9.5
        thigh = Part.makeCylinder(thigh_r, thigh_len, Vector(cx, -15.0, 5.0), Vector(0, -1, 0))

        # Knee elbow / corner
        knee = Part.makeSphere(thigh_r, Vector(cx, -15.0 - thigh_len, 5.0))

        # Shin / Foot: vertical upward cylinder with rounded tip
        shin_h = 7.5
        shin = Part.makeCylinder(thigh_r, shin_h, Vector(cx, -15.0 - thigh_len, 5.0), Vector(0, 0, 1))
        toe = Part.makeSphere(thigh_r, Vector(cx, -15.0 - thigh_len, 5.0 + shin_h))

        return thigh.fuse(knee).fuse(shin).fuse(toe)

    obj_sit_leg_l = doc.addObject("Part::Feature", "BMO_Sitting_Leg_Left")
    obj_sit_leg_l.Shape = make_sitting_leg(-8.0)
    obj_sit_leg_r = doc.addObject("Part::Feature", "BMO_Sitting_Leg_Right")
    obj_sit_leg_r.Shape = make_sitting_leg(8.0)

    # --- Sitting Arms (Running down side walls, resting hands on desk) ---
    def make_sitting_arm(x_side):
        sgn = 1.0 if x_side > 0 else -1.0
        arm_r = 2.0

        # Shoulder at Z = 24.0 mm, Y = 0.0
        shoulder = Part.makeSphere(arm_r, Vector(x_side, 0.0, 24.0))

        # Upper Arm: running down the side wall from Z=24 to Z=4.0
        upper = Part.makeCylinder(arm_r, 20.0, Vector(x_side, 0.0, 4.0), Vector(0, 0, 1))

        # Elbow: at Z = 4.0, Y = 0.0
        elbow = Part.makeSphere(arm_r, Vector(x_side, 0.0, 4.0))

        # Forearm: curving forward and down to desk (Z = 1.5, Y = -6.0)
        forearm = Part.makeCylinder(arm_r, 7.5, Vector(x_side, 0.0, 4.0), Vector(0, -0.85, -0.35))

        # Resting Hand: flattened palm with 3 cute finger ridges resting flat on desk
        hand_palm = Part.makeBox(3.5, 6.0, 1.8,
                                 Vector(x_side - (1.75 if sgn > 0 else 1.75), -11.0, 0.0))
        # 3 little finger ridges
        f1 = Part.makeCylinder(0.8, 2.5, Vector(x_side + sgn*0.8, -11.0, 0.9), Vector(0, -1, 0))
        f2 = Part.makeCylinder(0.8, 2.8, Vector(x_side, -11.0, 0.9), Vector(0, -1, 0))
        f3 = Part.makeCylinder(0.8, 2.5, Vector(x_side - sgn*0.8, -11.0, 0.9), Vector(0, -1, 0))
        hand = hand_palm.fuse(f1).fuse(f2).fuse(f3)

        return shoulder.fuse(upper).fuse(elbow).fuse(forearm).fuse(hand)

    obj_sit_arm_l = doc.addObject("Part::Feature", "BMO_Sitting_Arm_Left")
    obj_sit_arm_l.Shape = make_sitting_arm(-22.0)
    obj_sit_arm_r = doc.addObject("Part::Feature", "BMO_Sitting_Arm_Right")
    obj_sit_arm_r.Shape = make_sitting_arm(22.0)

    # --- Side "BMO" Embossed Logos ---
    def make_bmo_letters(x_pos, embossed_dir):
        b_outer = Part.makeBox(0.8, 3.6, 7.0, Vector(x_pos, -6.5, 26.0))
        b_cut1 = Part.makeBox(1.0, 1.8, 1.6, Vector(x_pos - 0.1, -5.3, 29.8))
        b_cut2 = Part.makeBox(1.0, 1.8, 1.6, Vector(x_pos - 0.1, -5.3, 27.2))
        b_shape = b_outer.cut(b_cut1).cut(b_cut2)
        m_outer = Part.makeBox(0.8, 4.2, 7.0, Vector(x_pos, -1.8, 26.0))
        m_cut = Part.makeBox(1.0, 1.6, 4.0, Vector(x_pos - 0.1, -0.5, 26.0))
        m_shape = m_outer.cut(m_cut)
        o_outer = Part.makeBox(0.8, 3.6, 7.0, Vector(x_pos, 3.2, 26.0))
        o_cut = Part.makeBox(1.0, 1.6, 4.4, Vector(x_pos - 0.1, 4.2, 27.3))
        o_shape = o_outer.cut(o_cut)
        return b_shape.fuse(m_shape).fuse(o_shape)

    obj_logo_l = doc.addObject("Part::Feature", "BMO_Logo_Left")
    obj_logo_l.Shape = make_bmo_letters(-22.8, -1)
    obj_logo_r = doc.addObject("Part::Feature", "BMO_Logo_Right")
    obj_logo_r.Shape = make_bmo_letters(22.0, 1)

    for o in [obj_sit_leg_l, obj_sit_leg_r, obj_sit_arm_l, obj_sit_arm_r, obj_logo_l, obj_logo_r]:
        grp_limbs.addObject(o)

    # =========================================================================
    # 6. INSPECTION CUTAWAY VIEW (Half-Section to verify internals)
    # =========================================================================
    cut_space = Part.makeBox(100.0, 100.0, 150.0, Vector(-100.0, -50.0, -30.0))
    cutaway_shell = front_shell_final.cut(cut_space)
    cutaway_lid = back_lid_final.cut(cut_space)
    cutaway_assembly = cutaway_shell.fuse(cutaway_lid)

    obj_cutaway = doc.addObject("Part::Feature", "BMO_Enclosure_SectionCut")
    obj_cutaway.Shape = cutaway_assembly
    obj_cutaway.ViewObject.Visibility = False
    grp_inspection.addObject(obj_cutaway)

    doc.recompute()

    # =========================================================================
    # 7. COLORS & PRESENTATION (Matching Reference BMO)
    # =========================================================================
    if Gui.activeDocument():
        # Palette matching reference photo:
        CLR_TEAL = (0.35, 0.76, 0.72)       # Pastel mint / turquoise teal body
        CLR_TEAL_DARK = (0.28, 0.65, 0.61)  # Rear lid
        CLR_SCREEN_GLASS = (0.05, 0.10, 0.12)
        CLR_SCREEN_FACE = (0.0, 0.95, 0.95) # Cyan animated face
        CLR_YELLOW_DPAD = (0.96, 0.82, 0.18)# Yellow cross
        CLR_RED_BTN = (0.88, 0.22, 0.18)    # Chunky red button
        CLR_LOGO_TEAL = (0.18, 0.45, 0.42)  # Darker engraved tone

        CLR_PCB_BLUE = (0.05, 0.20, 0.65)
        CLR_PCB_BLACK = (0.12, 0.12, 0.12)
        CLR_SILVER = (0.80, 0.82, 0.85)
        CLR_GOLD = (0.85, 0.75, 0.20)

        # Enclosure & Limbs
        obj_front_shell.ViewObject.ShapeColor = CLR_TEAL
        obj_front_shell.ViewObject.Transparency = 0
        obj_back_lid.ViewObject.ShapeColor = CLR_TEAL_DARK

        obj_sit_leg_l.ViewObject.ShapeColor = CLR_TEAL
        obj_sit_leg_r.ViewObject.ShapeColor = CLR_TEAL
        obj_sit_arm_l.ViewObject.ShapeColor = CLR_TEAL
        obj_sit_arm_r.ViewObject.ShapeColor = CLR_TEAL

        obj_logo_l.ViewObject.ShapeColor = CLR_LOGO_TEAL
        obj_logo_r.ViewObject.ShapeColor = CLR_LOGO_TEAL

        # Front Controls
        obj_ctrl_dpad.ViewObject.ShapeColor = CLR_YELLOW_DPAD
        obj_ctrl_tri.ViewObject.ShapeColor = CLR_TEAL
        obj_ctrl_red.ViewObject.ShapeColor = CLR_RED_BTN
        obj_ctrl_small_up.ViewObject.ShapeColor = CLR_TEAL
        obj_ctrl_small_mid.ViewObject.ShapeColor = CLR_TEAL
        obj_ctrl_disk.ViewObject.ShapeColor = CLR_TEAL

        # Electronics
        obj_oled_pcb.ViewObject.ShapeColor = CLR_PCB_BLUE
        obj_oled_glass.ViewObject.ShapeColor = CLR_SCREEN_GLASS
        obj_oled_disp.ViewObject.ShapeColor = CLR_SCREEN_FACE
        obj_oled_hdr.ViewObject.ShapeColor = CLR_GOLD

        obj_btn_sw_a.ViewObject.ShapeColor = CLR_SILVER
        obj_btn_sw_b.ViewObject.ShapeColor = CLR_SILVER
        obj_bat.ViewObject.ShapeColor = CLR_SILVER
        obj_esp.ViewObject.ShapeColor = CLR_PCB_BLACK
        obj_pwr.ViewObject.ShapeColor = CLR_PCB_BLUE

        obj_cutaway.ViewObject.ShapeColor = CLR_TEAL

    # =========================================================================
    # 8. AUTOMATED COLLISION CHECK
    # =========================================================================
    print("\n=== Automated Geometric Collision Check ===")
    pairs_to_check = [
        ("Battery", obj_bat.Shape, "ESP32-CAM", obj_esp.Shape),
        ("Battery", obj_bat.Shape, "OLED PCB", obj_oled_pcb.Shape),
        ("Battery", obj_bat.Shape, "Tactile Switch A", obj_btn_sw_a.Shape),
        ("Battery", obj_bat.Shape, "Tactile Switch B", obj_btn_sw_b.Shape),
        ("Battery", obj_bat.Shape, "Power Module", obj_pwr.Shape),
        ("ESP32-CAM", obj_esp.Shape, "Power Module", obj_pwr.Shape),
        ("OLED Glass", obj_oled_glass.Shape, "Tactile Switch A", obj_btn_sw_a.Shape),
        ("Tactile Switch A", obj_btn_sw_a.Shape, "Tactile Switch B", obj_btn_sw_b.Shape),
    ]

    collision_found = False
    for name1, shape1, name2, shape2 in pairs_to_check:
        common_vol = shape1.common(shape2).Volume
        if common_vol > 0.001:
            print(f"  [COLLISION DETECTED] {name1} <-> {name2}: {common_vol:.3f} mm³")
            collision_found = True
        else:
            print(f"  [PASS] {name1} <-> {name2}: 0.000 mm³ overlap")

    if not collision_found:
        print(">> ALL COMPONENT CHECKS PASSED: 0.000 mm³ collision across all internal layers!")

    # =========================================================================
    # 9. SAVE DOCUMENT & EXPORT PREVIEWS
    # =========================================================================
    doc.recompute()
    save_path = "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/BMO_QUOTA_PET.FCStd"
    doc.saveAs(save_path)
    print(f"\nDocument saved successfully to: {save_path}")

    if Gui.activeDocument():
        view = Gui.activeDocument().activeView()

        # 1. Exterior Isometric View
        obj_front_shell.ViewObject.Transparency = 0
        obj_cutaway.ViewObject.Visibility = False
        view.viewAxometric()
        view.fitAll()
        img_iso = "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/bmo_concept_isometric.png"
        view.saveImage(img_iso, 1920, 1080, "White")
        print(f"Exported Isometric: {img_iso}")

        # 2. Front Orthographic View
        view.viewFront()
        view.fitAll()
        img_front = "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/bmo_concept_front.png"
        view.saveImage(img_front, 1920, 1080, "White")
        print(f"Exported Front: {img_front}")

        # 3. Transparent X-Ray Internal Packaging View
        obj_front_shell.ViewObject.Transparency = 65
        view.viewAxometric()
        view.fitAll()
        img_internal = "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/bmo_internal_layout.png"
        view.saveImage(img_internal, 1920, 1080, "White")
        print(f"Exported Internal Layout: {img_internal}")

        # 4. Cutaway Section View
        obj_front_shell.ViewObject.Visibility = False
        obj_back_lid.ViewObject.Visibility = False
        obj_cutaway.ViewObject.Visibility = True
        view.viewAxometric()
        view.fitAll()
        img_cutaway = "/Users/apple/QUOCDUY/PROJECT/BMO_QUOTA_PET/bmo_cutaway_preview.png"
        view.saveImage(img_cutaway, 1920, 1080, "White")
        print(f"Exported Section Cutaway: {img_cutaway}")

        # Reset view
        obj_front_shell.ViewObject.Visibility = True
        obj_front_shell.ViewObject.Transparency = 0
        obj_back_lid.ViewObject.Visibility = True
        obj_cutaway.ViewObject.Visibility = False
        view.viewAxometric()
        view.fitAll()

    print("\n=== Sitting BMO CAD Model Complete! ===")

if __name__ == "__main__":
    build_bmo_cad()
