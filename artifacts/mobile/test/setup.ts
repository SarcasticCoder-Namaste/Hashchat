import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import AsyncStorage from "./mocks/asyncStorage";
import { __resetForTests } from "@/lib/offlineQueue";
import { __setOnlineForTests } from "./mocks/useOnline";

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetForTests();
  __setOnlineForTests(true);
});

afterEach(() => {
  cleanup();
});
