import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { adminUser, loading } = useAuth();
  if (loading) return null;
  if (adminUser) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
