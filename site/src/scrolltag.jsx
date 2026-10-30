// Tags the scroll container so other code can find it ("Show me how" glides it).
import { useScroll } from "@react-three/drei";
import { useEffect } from "react";

export function ScrollTag({ name }) {
  const data = useScroll();
  useEffect(() => { data.el.dataset.scroll = name; }, [data, name]);
  return null;
}
