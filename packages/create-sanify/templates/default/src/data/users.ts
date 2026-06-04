// data/users.ts — data contoh + simulasi fetch async (untuk demo resource())

export interface User {
  id: string;
  name: string;
}

export interface Profile extends User {
  email: string;
  bio: string;
}

export const users: User[] = [
  { id: "ada", name: "Ada Lovelace" },
  { id: "alan", name: "Alan Turing" },
  { id: "grace", name: "Grace Hopper" },
];

// Tanpa jaringan: tiru latensi + kemungkinan error agar resource() terlihat.
export function fetchProfile(id: string): Promise<Profile> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const u = users.find((x) => x.id === id);
      if (!u) reject(new Error(`User "${id}" tidak ditemukan`));
      else resolve({ ...u, email: `${u.id}@sanify.dev`, bio: `Profil ${u.name}.` });
    }, 400);
  });
}
