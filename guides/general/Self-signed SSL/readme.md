# Generate ssl certificates with Subject Alt Names on OSX

Open `ssl.conf` in a text editor.

Edit the domain(s) listed under the `[alt_names]` section so that they match the local domain name you want to use for your project, e.g.

    DNS.1   = my-project.dev

Additional FQDNs can be added if required:

    DNS.1   = my-project.dev
    DNS.2   = www.my-project.dev
    DNS.3   = fr.my-project.dev

Create a directory for your project, e.g. `my_project` and save `ssl.conf` inside it.

Open Terminal and navigate to 'my_project':

    cd my_project

Generate a private key:

    openssl genrsa -out private.key 4096

Generate a Certificate Signing Request

    openssl req -new -sha256 \
        -out private.csr \
        -key private.key \
        -config ssl.conf


(You will be asked a series of questions about your certificate. Answer however you like, but for 'Common name' enter the name of your project, e.g. `my_project`)

Now check the CSR:

    openssl req -text -noout -in private.csr

You should see this:

`X509v3 Subject Alternative Name: DNS:my-project.site` and
`Signature Algorithm: sha256WithRSAEncryption`

Generate the certificate

    openssl x509 -req \
        -sha256 \
        -days 3650 \
        -in private.csr \
        -signkey private.key \
        -out private.crt \
        -extensions req_ext \
        -extfile ssl.conf

Add the certificate to keychain and trust it:

    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain private.crt

(Alternatively, double click on the certificate file `private.crt` to open Keychain Access. Your project name `my_project` will be listed under the login keychain. Double click it and select 'Always trust' under the 'Trust' section.)
