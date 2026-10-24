# Source this file: `source scripts/dev-env.sh`
# Puts Manim, FFmpeg and Node on PATH when they come from the user-level
# micromamba env (machines without sudo). On machines with system packages
# (apt/brew) it does nothing and the system tools are used.
PNP_MAMBA_ENV="${PNP_MAMBA_ENV:-$HOME/.local/share/mamba/envs/pnp}"
if [ -d "$PNP_MAMBA_ENV/bin" ]; then
  export PATH="$PNP_MAMBA_ENV/bin:$HOME/.local/bin:$PATH"
fi
export PATH="$HOME/.local/bin:$PATH"
