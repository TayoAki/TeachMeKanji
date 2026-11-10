// TEMPLATE FILE — owned by the platform, never written by the model.
// Where the person is, when they allow it: coordinates and a readable place ("Shibuya, Tokyo").
// Nothing is requested until request() is called, so a screen can explain why first.
import { useCallback, useEffect, useState } from "react";
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  reverseGeocodeAsync,
} from "expo-location";

export interface Place {
  latitude: number;
  longitude: number;
  /** City and region, or "" when it can't be named. */
  name: string;
}

type Permission = "undetermined" | "granted" | "denied";

async function locate(): Promise<Place> {
  const { coords } = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
  let name = "";
  try {
    const [address] = await reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (address)
      name = [address.district ?? address.city, address.city ?? address.region]
        .filter((part, i, all) => part && all.indexOf(part) === i)
        .join(", ");
  } catch {
    // Naming the place is optional.
  }
  return { latitude: coords.latitude, longitude: coords.longitude, name };
}

export function useLocation() {
  const [permission, setPermission] = useState<Permission>("undetermined");
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlace(await locate());
    } catch {
      setError("Couldn't get your location. Try again outside or near a window.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getForegroundPermissionsAsync()
      .then(({ status }) => {
        setPermission(status as Permission);
        if (status === "granted") void refresh();
      })
      .catch(() => undefined);
  }, [refresh]);

  /** Ask for permission (once) and locate. Resolves false if the person declines. */
  async function request(): Promise<boolean> {
    const { status } = await requestForegroundPermissionsAsync();
    setPermission(status as Permission);
    if (status !== "granted") return false;
    await refresh();
    return true;
  }

  return { permission, place, loading, error, request, refresh };
}
