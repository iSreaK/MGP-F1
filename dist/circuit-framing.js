// Fit the geographic plan into the space between the circuit information and
// the bottom controls. Apply only to the overview, leaving race cameras alone.
export function frameCircuitOverview(THREE, camera, bounds, position, target) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const portrait = camera.aspect < .8;
  const tangent = Math.tan(camera.fov * Math.PI / 360);
  const heightFraction = portrait ? .38 : .54;
  const widthFraction = portrait ? .82 : .66;
  const height = 1.12 * Math.max(
    size.z / (2 * tangent * heightFraction),
    size.x / (2 * tangent * camera.aspect * widthFraction),
  );
  const shiftX = camera.aspect >= 1.1 ? -height * tangent * camera.aspect * .18 : 0;
  const shiftZ = height * tangent * .15;
  target.copy(center).add(new THREE.Vector3(shiftX, 0, shiftZ));
  // No east/west eye offset: north remains at the top of the geographic plan.
  position.copy(target).add(new THREE.Vector3(0, height, height * .08));
}
