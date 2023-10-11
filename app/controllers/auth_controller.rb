# frozen_string_literal: true

class AuthController < ApplicationController
  skip_before_action :require_sign_in, only: %i[sign_in sign_in_submit]

  def sign_in
    @user = User.new
  end

  def sign_in_submit
    @user = User.find_or_initialize_by(username: user_params['username'])

    if @user&.authenticate(user_params[:password])
      session[:user_id] = @user.id
      return redirect_to root_path
    end

    flash.now[:alert] = translate('please_try_again')
    render :sign_in, status: :unprocessable_entity
  end

  private

  def user_params
    params.require(:user).permit(:username, :password)
  end
end
