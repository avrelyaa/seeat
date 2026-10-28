import Svg, { Circle, Path, Rect } from 'react-native-svg';

type NavName = 'discover' | 'listings' | 'orders' | 'shop' | 'admin';

export function NavIcon({ name, selected }: { name: NavName; selected: boolean }) {
  const color = selected ? '#D84F68' : '#76636F';
  const shared = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={23} height={23} viewBox="0 0 24 24" accessibilityElementsHidden>
    {name === 'discover' && <><Circle cx="10.8" cy="10.8" r="6.7" {...shared} /><Path d="m16 16 4.2 4.2" {...shared} /></>}
    {name === 'listings' && <><Rect x="3" y="6" width="18" height="15" rx="2" {...shared} /><Path d="M3 10h18M8 6V3h8v3M8 14h8M8 17h5" {...shared} /></>}
    {name === 'orders' && <><Path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" {...shared} /><Path d="M8 8h8M8 12h8M8 16h5" {...shared} /></>}
    {name === 'shop' && <><Path d="M4 10h16v11H4V10ZM3 10l2-6h14l2 6M9 10v11M14 14h3" {...shared} /></>}
    {name === 'admin' && <><Path d="M12 2.5 20 6v5.6c0 4.4-3.1 7.8-8 9.9-4.9-2.1-8-5.5-8-9.9V6l8-3.5Z" {...shared} /><Path d="m8.5 12 2.3 2.3 4.7-4.7" {...shared} /></>}
  </Svg>;
}
