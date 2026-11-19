// Exemplo SCAD de suporte para sensor
$fn = 64;
base_l = 58;
base_w = 42;
base_h = 5;

module rounded_plate(l, w, h, r) {
  hull() {
    for (x = [-l/2 + r, l/2 - r])
      for (y = [-w/2 + r, w/2 - r])
        translate([x, y, 0]) cylinder(h = h, r = r, center = true);
  }
}

difference() {
  union() {
    rounded_plate(base_l, base_w, base_h, 4);
    translate([0, 0, 13]) cylinder(h = 22, d = 30, center = true);
  }
  translate([0, 0, 13]) cylinder(h = 24, d = 17, center = true);
  for (x = [-20, 20])
    for (y = [-12, 12])
      translate([x, y, 0]) cylinder(h = 10, d = 4.5, center = true);
}
