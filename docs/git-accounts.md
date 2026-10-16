# Contas pessoal e de trabalho na mesma máquina

A identidade de commits deste repositório é configurada localmente. A
configuração global pode continuar apontando para a conta de trabalho.

```bash
git config --local user.name 'Gabriel Donizetti'
git config --local user.email '69644547+Gabriel-Donizetti@users.noreply.github.com'
```

A identidade do commit e a conta usada para autenticar o push são configurações
separadas. Para manter a credencial pessoal em um perfil próprio do GitHub CLI:

```bash
env -u GITHUB_TOKEN -u GH_TOKEN GH_CONFIG_DIR="$HOME/.config/gh-personal" \
  gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow

git config --local credential.https://github.com.helper ''
git config --local --add credential.https://github.com.helper \
  '!env -u GITHUB_TOKEN -u GH_TOKEN GH_CONFIG_DIR="$HOME/.config/gh-personal" gh auth git-credential'
git config --local credential.https://github.com.username Gabriel-Donizetti
```

O primeiro helper vazio desativa os helpers herdados apenas neste repositório.
O helper seguinte remove as variáveis de token somente no subprocesso Git e
usa a credencial do perfil pessoal. Os outros repositórios continuam com seus
helpers e configuração global. Não coloque tokens em URLs de remotes.

Para conferir sem expor segredos:

```bash
git config --show-origin --get-regexp '^user\.'
git remote -v
env -u GITHUB_TOKEN -u GH_TOKEN GH_CONFIG_DIR="$HOME/.config/gh-personal" \
  gh api user --jq .login
```

Ao clonar em outra máquina, a configuração local de `.git/config` não é
transferida. Reaplique o perfil desejado antes de criar commits e fazer push.
