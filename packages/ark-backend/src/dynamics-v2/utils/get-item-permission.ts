type Claim = {
  read: boolean;
  write: boolean;
  owner: boolean;
};
type PermissionResult = {
  claims: Claim;
  currentItem: any;
  pathItems: any[];
};

export type IDynamicsPermissionDataStore = {
  getItems: (paths: string[]) => Promise<any[]>;
};

export const extractPaths = (path: string = ''): string[] => {
  /** Normalise path (removes leading / (slash) if any) */
  if (path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  let paths: string[] = [];

  let bufferParts: string[] = path.split('/');
  let i: number;
  for (i = bufferParts.length; i > 0; i--) {
    paths.unshift(bufferParts.slice(0, i).join('/') || '/');
  }

  return paths;
};

function inheritPermissions(items: any[]): any[] {
  let bufferedPermissions: any = [];

  for (const item of items) {
    if (
      Array.isArray(item?.security?.permissions) &&
      item?.security?.permissions?.length > 0
    ) {
      bufferedPermissions = item.security.permissions;
    } else {
      if (!item?.security) {
        item.security = {
          permissions: [],
        };
      }

      item.security.permissions = bufferedPermissions;
    }
  }

  return items;
}

export const getItemPermission = async (
  ns: string,
  path: string,
  user: { emailAddress?: string; policies?: string[] },
  store: IDynamicsPermissionDataStore
): Promise<PermissionResult> => {
  const paths = extractPaths(path);

  let items = await store.getItems(paths);
  items = inheritPermissions(items);

  const currentItem = items[items.length - 1] || null;

  let permissions = [];
  let claims: Claim = {
    owner: false,
    read: false,
    write: false,
  };

  let IS_SUPER_ADMIN = false;
  if (Array.isArray(user?.policies)) {
    IS_SUPER_ADMIN = user.policies.findIndex((p) => p === 'SUPER_ADMIN') > -1;
  }

  if (IS_SUPER_ADMIN === false) {
    if (Array.isArray(currentItem?.security?.permissions)) {
      permissions = currentItem?.security?.permissions.filter((p) => {
        switch (p?.type) {
          case 'user': {
            if (p?.userEmail) {
              return p?.userEmail === user?.emailAddress;
            }

            break;
          }
          case 'policy': {
            if (p?.policy && Array.isArray(user?.policies)) {
              return user.policies.findIndex((pol) => pol === p?.policy) > -1;
            }

            break;
          }
          case 'public': {
            return true;
          }
        }

        return false;
      });

      for (const permission of permissions) {
        switch (permission?.access) {
          case 'read': {
            claims.read = true;
            break;
          }
          case 'write': {
            claims.read = true;
            claims.write = true;
            break;
          }
          case 'owner': {
            claims.read = true;
            claims.write = true;
            claims.owner = true;
            break;
          }
        }

        if (claims.owner === true) {
          break;
        }
      }
    }
  } else {
    claims.owner = true;
    claims.write = true;
    claims.read = true;
  }

  return {
    currentItem,
    pathItems: items,
    claims,
  };
};
